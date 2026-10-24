import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { Collection } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DATABASE_NAME = "rbxkit";
const COOKIE_COLLECTION = "auth_cookies";
const SETTINGS_COLLECTION = "cookie_settings";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

export type CookieStatus = "unknown" | "valid" | "expired";

export type CookieRecord = {
  id: string;
  label: string;
  status: CookieStatus;
  active: boolean;
  createdAt: string;
  checkedAt: string | null;
};

type StoredCookie = {
  id: string;
  label: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  status: CookieStatus;
  createdAt: Date;
  checkedAt: Date | null;
};

type CookieSettings = {
  _id: "resolver";
  activeCookieId: string | null;
};

function getEncryptionKey() {
  const configuredKey = process.env.COOKIE_ENCRYPTION_KEY;

  if (!configuredKey) {
    throw new Error("COOKIE_ENCRYPTION_KEY is not configured");
  }

  const key =
    /^[a-f0-9]{64}$/i.test(configuredKey)
      ? Buffer.from(configuredKey, "hex")
      : Buffer.from(configuredKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "COOKIE_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key"
    );
  }

  return key;
}

function encryptCookie(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encryptedValue = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedValue: encryptedValue.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCookie(record: StoredCookie) {
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(record.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(record.encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function getCookieCollection(): Promise<Collection<StoredCookie>> {
  const client = await clientPromise;

  return client
    .db(DATABASE_NAME)
    .collection<StoredCookie>(COOKIE_COLLECTION);
}

async function getSettingsCollection(): Promise<
  Collection<CookieSettings>
> {
  const client = await clientPromise;

  return client
    .db(DATABASE_NAME)
    .collection<CookieSettings>(SETTINGS_COLLECTION);
}

export async function listCookies(): Promise<CookieRecord[]> {
  const [cookies, settingsCollection] = await Promise.all([
    getCookieCollection(),
    getSettingsCollection(),
  ]);
  const [records, settings] = await Promise.all([
    cookies.find({}).sort({ createdAt: -1 }).toArray(),
    settingsCollection.findOne({ _id: "resolver" }),
  ]);

  return records.map((record) => ({
    id: record.id,
    label: record.label,
    status: record.status,
    active: settings?.activeCookieId === record.id,
    createdAt: record.createdAt.toISOString(),
    checkedAt: record.checkedAt?.toISOString() ?? null,
  }));
}

export async function getActiveManagedCookie() {
  const [cookies, settingsCollection] = await Promise.all([
    getCookieCollection(),
    getSettingsCollection(),
  ]);
  const settings = await settingsCollection.findOne({ _id: "resolver" });

  if (!settings?.activeCookieId) {
    return null;
  }

  const record = await cookies.findOne({ id: settings.activeCookieId });

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    status: record.status,
    value: decryptCookie(record),
  };
}

export async function getCookieRecord(id: string) {
  const collection = await getCookieCollection();

  return collection.findOne({ id });
}

export async function addCookie(label: string, value: string) {
  const collection = await getCookieCollection();
  const id = randomUUID();

  await collection.insertOne({
    id,
    label,
    ...encryptCookie(value),
    status: "unknown",
    createdAt: new Date(),
    checkedAt: null,
  });
}

export async function replaceCookie(
  id: string,
  label: string,
  value: string
) {
  const collection = await getCookieCollection();

  const result = await collection.updateOne(
    { id },
    {
      $set: {
        label,
        ...encryptCookie(value),
        status: "unknown",
        checkedAt: null,
      },
    }
  );

  return result.matchedCount > 0;
}

export async function updateCookieStatus(
  id: string,
  status: CookieStatus
) {
  const collection = await getCookieCollection();

  await collection.updateOne(
    { id },
    {
      $set: {
        status,
        checkedAt: new Date(),
      },
    }
  );
}

export async function setActiveCookie(id: string) {
  const [cookies, settingsCollection] = await Promise.all([
    getCookieCollection(),
    getSettingsCollection(),
  ]);
  const candidate = await cookies.findOne({ id });

  if (!candidate) {
    return "not-found" as const;
  }

  if (candidate.status !== "valid") {
    return "not-valid" as const;
  }

  await settingsCollection.updateOne(
    { _id: "resolver" },
    { $set: { activeCookieId: id } },
    { upsert: true }
  );

  return "success" as const;
}

export async function removeCookie(id: string) {
  const [cookies, settingsCollection] = await Promise.all([
    getCookieCollection(),
    getSettingsCollection(),
  ]);

  await Promise.all([
    cookies.deleteOne({ id }),
    settingsCollection.updateOne(
      { _id: "resolver", activeCookieId: id },
      { $set: { activeCookieId: null } }
    ),
  ]);
}

export async function markCookieExpired(id: string) {
  await updateCookieStatus(id, "expired");
}
