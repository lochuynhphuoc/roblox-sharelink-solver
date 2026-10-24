import { NextRequest, NextResponse } from "next/server";
import {
  addCookie,
  decryptCookie,
  getCookieRecord,
  listCookies,
  removeCookie,
  replaceCookie,
  setActiveCookie,
  updateCookieStatus,
  type CookieStatus,
} from "@/lib/cookie-vault";
import {
  isAdminRequest,
  isSameOriginRequest,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

const MAX_COOKIES = 100;
const MAX_BULK_ADD = 20;
const MAX_COOKIE_LENGTH = 4096;

type CookieActionBody = {
  action?: unknown;
  id?: unknown;
  label?: unknown;
  cookie?: unknown;
  items?: unknown;
};

type CookieInput = {
  label: string;
  cookie: string;
};

function validateCookieInput(
  labelValue: unknown,
  cookieValue: unknown
): CookieInput | null {
  if (typeof labelValue !== "string" || typeof cookieValue !== "string") {
    return null;
  }

  const label = labelValue.trim();
  const cookie = cookieValue.trim();

  if (
    !label ||
    label.length > 60 ||
    !cookie ||
    cookie.length > MAX_COOKIE_LENGTH ||
    /[^\x21-\x7e;]/.test(cookie)
  ) {
    return null;
  }

  return { label, cookie };
}

async function checkCookie(cookie: string) {
  const response = await fetch(
    "https://users.roblox.com/v1/users/authenticated",
    {
    method: "GET",
    headers: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    }
  );

  if (response.status === 401) {
    return "expired" as const;
  }

  if (response.ok) {
    return "valid" as const;
  }

  throw new Error(`Roblox validity check failed (${response.status})`);
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookies = await listCookies();
    const response = NextResponse.json({ cookies });
    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch (error) {
    console.error("Admin cookie list failed:", error);

    return NextResponse.json(
      { error: "Unable to load cookie records" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CookieActionBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "add") {
      const items = Array.isArray(body.items)
        ? body.items.map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const input = item as Record<string, unknown>;
            return validateCookieInput(input.label, input.cookie);
          })
        : [];
      const existingCookies = await listCookies();

      if (
        items.length === 0 ||
        items.length > MAX_BULK_ADD ||
        items.some((item) => item === null)
      ) {
        return NextResponse.json(
          { error: `Provide 1 to ${MAX_BULK_ADD} valid cookie entries` },
          { status: 400 }
        );
      }

      if (existingCookies.length + items.length > MAX_COOKIES) {
        return NextResponse.json(
          { error: `A maximum of ${MAX_COOKIES} cookies can be stored` },
          { status: 400 }
        );
      }

      for (const item of items) {
        if (item) {
          await addCookie(item.label, item.cookie);
        }
      }
    } else if (action === "replace") {
      const id = typeof body.id === "string" ? body.id : "";
      const input = validateCookieInput(body.label, body.cookie);

      if (!id || !input) {
        return NextResponse.json(
          { error: "Enter a valid label and replacement cookie" },
          { status: 400 }
        );
      }

      const replaced = await replaceCookie(id, input.label, input.cookie);

      if (!replaced) {
        return NextResponse.json({ error: "Cookie not found" }, { status: 404 });
      }
    } else if (action === "check") {
      const id = typeof body.id === "string" ? body.id : "";
      const records = await listCookies();
      const record = records.find((item) => item.id === id);

      if (!record) {
        return NextResponse.json({ error: "Cookie not found" }, { status: 404 });
      }

      const storedCookie = await getCookieRecord(id);

      if (!storedCookie) {
        return NextResponse.json({ error: "Cookie not found" }, { status: 404 });
      }

      const status: CookieStatus = await checkCookie(decryptCookie(storedCookie));

      await updateCookieStatus(id, status);
    } else if (action === "activate") {
      const id = typeof body.id === "string" ? body.id : "";
      const result = await setActiveCookie(id);

      if (result === "not-found") {
        return NextResponse.json({ error: "Cookie not found" }, { status: 404 });
      }

      if (result === "not-valid") {
        return NextResponse.json(
          { error: "Check this cookie successfully before selecting it" },
          { status: 409 }
        );
      }
    } else if (action === "remove") {
      const id = typeof body.id === "string" ? body.id : "";

      if (!id) {
        return NextResponse.json({ error: "Cookie ID is required" }, { status: 400 });
      }

      await removeCookie(id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, cookies: await listCookies() });
  } catch (error) {
    console.error("Admin cookie operation failed:", error);

    const message =
      error instanceof Error && error.message.startsWith("Roblox validity check failed")
        ? error.message
        : "Unable to complete cookie operation";
    const status = message.startsWith("Roblox validity check failed") ? 502 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
