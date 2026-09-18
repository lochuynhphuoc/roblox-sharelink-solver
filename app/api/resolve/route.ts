import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import type { Collection } from "mongodb";

const RESOLVE_URL =
  "https://apis.roblox.com/sharelinks/v1/resolve-link";

const DB_NAME = "rbxkit";
const COLLECTION_NAME = "resolved_links";
const MAX_LINKS = 50;
const REQUEST_DELAY_MS = 300;

let csrfToken: string | null = null;

type ParsedShareLink = {
  originalLink: string;
  shareCode: string;
  linkType: string;
};

type ResolveResult = {
  link: string;
  success: boolean;
  id?: string;
  name?: string;
  error?: string;
  source?: "cache" | "roblox";
};

function extractId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const id = extractId(item);

      if (id) {
        return id;
      }
    }

    return null;
  }

  const object = value as Record<string, unknown>;

  const possibleKeys = [
    "itemId",
    "assetId",
    "bundleId",
    "id",
    "universeId",
    "placeId",
    "userId",
    "groupId",
  ];

  for (const key of possibleKeys) {
    const candidate = object[key];

    if (
      typeof candidate === "string" &&
      candidate.trim() !== ""
    ) {
      return candidate;
    }

    if (
      typeof candidate === "number" &&
      Number.isFinite(candidate)
    ) {
      return String(candidate);
    }
  }

  for (const value of Object.values(object)) {
    const id = extractId(value);

    if (id) {
      return id;
    }
  }

  return null;
}

function parseShareUrl(link: string): ParsedShareLink {
  let url: URL;

  try {
    url = new URL(link);
  } catch {
    throw new Error("Invalid URL");
  }

  const hostname = url.hostname.toLowerCase();

  const isRobloxHost =
    hostname === "roblox.com" ||
    hostname.endsWith(".roblox.com");

  if (!isRobloxHost) {
    throw new Error("Invalid Roblox share link");
  }

  const pathname = url.pathname.toLowerCase();

  const isSharePath =
    pathname === "/share" ||
    pathname.startsWith("/share/");

  if (!isSharePath) {
    throw new Error("Invalid Roblox share link");
  }

  const shareCode = url.searchParams.get("code")?.trim() ?? "";
  const linkType = url.searchParams.get("type")?.trim() ?? "";

  if (!shareCode) {
    throw new Error("Missing share code");
  }

  if (!linkType) {
    throw new Error("Missing share link type");
  }

  return {
    originalLink: link,
    shareCode,
    linkType,
  };
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  const cookie = process.env.COOKIE;

  if (!cookie) {
    throw new Error("Missing Roblox cookie");
  }

  const response = await fetch(
    "https://auth.roblox.com/v2/logout",
    {
      method: "POST",
      headers: {
        Cookie: `.ROBLOSECURITY=${cookie}`,
      },
    }
  );

  const token = response.headers.get("x-csrf-token");

  if (!token) {
    if (response.status === 401) {
      throw new Error("Invalid Roblox cookie");
    }

    throw new Error(
      `Failed to obtain Roblox CSRF token (${response.status})`
    );
  }

  csrfToken = token;

  return token;
}

async function resolveFromRoblox(
  shareCode: string,
  linkType: string
): Promise<string> {
  const cookie = process.env.COOKIE;

  if (!cookie) {
    throw new Error("Missing Roblox cookie");
  }

  let token = await ensureCsrf();

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(RESOLVE_URL, {
      method: "POST",
      headers: {
        Cookie: `.ROBLOSECURITY=${cookie}`,
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": token,
      },
      body: JSON.stringify({
        linkId: shareCode,
        linkType,
      }),
    });

    if (response.status === 403 && attempt === 0) {
      csrfToken = null;
      token = await ensureCsrf();
      continue;
    }

    if (response.status === 401) {
      throw new Error("Invalid Roblox cookie");
    }

    if (!response.ok) {
      let message = `Roblox API error (${response.status})`;

      try {
        const data = await response.json();

        if (data?.message) {
          message = data.message;
        }
      } catch {
        // Ignore invalid JSON response.
      }

      throw new Error(message);
    }

    const data = await response.json();
    const id = extractId(data);

    if (!id) {
      throw new Error("Roblox returned no ID");
    }

    return id;
  }

  throw new Error("Failed to resolve Roblox share link");
}

async function getRobloxItemName(
  id: string,
  linkType: string
): Promise<string | null> {
  const normalizedType = linkType.toLowerCase();

  if (
    normalizedType === "asset" ||
    normalizedType === "item"
  ) {
    try {
      const response = await fetch(
        "https://catalog.roblox.com/v1/catalog/items/details",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: [
              {
                itemType: "Asset",
                id: Number(id),
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      const item = Array.isArray(data?.data)
        ? data.data[0]
        : null;

      if (
        item &&
        typeof item.name === "string" &&
        item.name.trim()
      ) {
        return item.name.trim();
      }
    } catch {
      return null;
    }
  }

  return null;
}

type CachedLinkDocument = {
  shareCode: string;
  linkType: string;
  shareLink?: string;
  canonicalLink?: string;
  robloxId?: string;
  createdAt?: Date;
  lastUsedAt?: Date;
};

async function getCollection(): Promise<
  Collection<CachedLinkDocument>
> {
  const client = await clientPromise;

  return client
    .db(DB_NAME)
    .collection<CachedLinkDocument>(COLLECTION_NAME);
}

async function findCachedLinks(
  links: ParsedShareLink[]
) {
  if (links.length === 0) {
    return [];
  }

  const collection = await getCollection();

  const query = {
    $or: links.map((link) => ({
      shareCode: link.shareCode,
      linkType: link.linkType,
    })),
  };

  return collection.find(query).toArray();
}

async function saveResolvedLink(
  parsed: ParsedShareLink,
  id: string,
  name: string | null
) {
  const collection = await getCollection();

  const now = new Date();

  await collection.updateOne(
    {
      shareCode: parsed.shareCode,
      linkType: parsed.linkType,
    },
    {
      $set: {
        shareLink: parsed.originalLink,
        canonicalLink: parsed.originalLink,
        robloxId: id,
        name: name ?? undefined,
        lastUsedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    {
      upsert: true,
    }
  );
}

async function updateCacheUsage(
  shareCode: string,
  linkType: string
) {
  const collection = await getCollection();

  await collection.updateOne(
    {
      shareCode,
      linkType,
    },
    {
      $set: {
        lastUsedAt: new Date(),
      },
    }
  );
}

async function resolveSingle(
  parsed: ParsedShareLink,
  cachedMap: Map<
    string,
    {
      id: string;
      name?: string;
    }
  >
): Promise<ResolveResult> {
  const cacheKey = `${parsed.shareCode}:${parsed.linkType}`;

  const cached = cachedMap.get(cacheKey);

  if (cached) {
    await updateCacheUsage(
      parsed.shareCode,
      parsed.linkType
    );

    return {
      link: parsed.originalLink,
      success: true,
      id: cached.id,
      name: cached.name,
      source: "cache",
    };
  }

  try {
    const id = await resolveFromRoblox(
      parsed.shareCode,
      parsed.linkType
    );

    const name = await getRobloxItemName(
      id,
      parsed.linkType
    );

    await saveResolvedLink(
      parsed,
      id,
      name
    );

    return {
      link: parsed.originalLink,
      success: true,
      id,
      name: name ?? undefined,
      source: "roblox",
    };
  } catch (error) {
    return {
      link: parsed.originalLink,
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error",
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const rawLinks: unknown[] = Array.isArray(body?.links)
    ? body.links
    : typeof body?.link === "string"
        ? [body.link]
        : [];

    const links = rawLinks
      .filter((link: unknown): link is string => {
        return typeof link === "string";
      })
      .map((link: string) => link.trim())
      .filter(Boolean);

    if (links.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No links provided",
        },
        { status: 400 }
      );
    }

    const uniqueLinks = [...new Set(links)];

    if (uniqueLinks.length > MAX_LINKS) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximum ${MAX_LINKS} links allowed`,
        },
        { status: 400 }
      );
    }

    const parsedLinks: ParsedShareLink[] = [];
    const validationResults: ResolveResult[] = [];

    for (const link of uniqueLinks) {
      try {
        const parsed = parseShareUrl(link);
        parsedLinks.push(parsed);
      } catch (error) {
        validationResults.push({
          link,
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Invalid link",
        });
      }
    }

    let cachedDocuments: Array<{
      shareCode: string;
      linkType: string;
      robloxId?: string;
      name?: string;
    }> = [];

    if (parsedLinks.length > 0) {
      cachedDocuments = await findCachedLinks(
        parsedLinks
      );
    }

    const cachedMap = new Map<
    string,
    {
        id: string;
        name?: string;
    }
    >();

    for (const document of cachedDocuments) {
    if (
        document.robloxId &&
        document.shareCode &&
        document.linkType
    ) {
        const cacheKey =
        `${document.shareCode}:${document.linkType}`;

        cachedMap.set(cacheKey, {
        id: document.robloxId,
        name: document.name,
        });
    }
    }

    const resolvedResults: ResolveResult[] = [];

    for (let i = 0; i < parsedLinks.length; i++) {
      const result = await resolveSingle(
        parsedLinks[i],
        cachedMap
      );

      resolvedResults.push(result);

      if (
        result.success &&
        result.source === "roblox" &&
        i < parsedLinks.length - 1
      ) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    const results = [
      ...validationResults,
      ...resolvedResults,
    ];

    const resolvedCount = results.filter(
      (result) => result.success
    ).length;

    const cachedCount = results.filter(
      (result) =>
        result.success &&
        result.source === "cache"
    ).length;

    const fetchedCount = results.filter(
      (result) =>
        result.success &&
        result.source === "roblox"
    ).length;

    return NextResponse.json({
      success: true,
      total: results.length,
      resolved: resolvedCount,
      cached: cachedCount,
      fetched: fetchedCount,
      results,
    });
  } catch (error) {
    console.error("Resolve API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}