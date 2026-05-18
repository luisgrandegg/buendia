import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for owner-backend credentials.
 *
 * Each call to {@link encrypt} generates a fresh 32-byte data key (DEK),
 * encrypts the plaintext under that DEK with AES-256-GCM, and then wraps
 * the DEK with the master key (KEK), also via AES-256-GCM. The resulting
 * blob is a single, self-contained ciphertext that can be stored as
 * `bytea` in Postgres.
 *
 * The master key (KEK) is loaded from `BUENDIA_MASTER_KEY` — a base64-
 * encoded 32-byte secret the operator provides. KMS-backed wrapping is
 * the planned next step; see decisions/0002-credential-envelope-encryption.md.
 *
 * Blob layout (version 1):
 *
 *   [0]            version byte (0x01)
 *   [1..12]        DEK IV       (12 bytes)
 *   [13..44]       wrapped DEK  (32 bytes — AES-GCM output of the 32-byte DEK)
 *   [45..60]       DEK auth tag (16 bytes)
 *   [61..72]       value IV     (12 bytes)
 *   [73..73+N]     ciphertext   (N bytes)
 *   [73+N..89+N]   value tag    (16 bytes)
 */

const VERSION = 0x01;
const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const DEK_IV_OFFSET = 1;
const DEK_CIPHERTEXT_OFFSET = DEK_IV_OFFSET + IV_BYTES;
const DEK_TAG_OFFSET = DEK_CIPHERTEXT_OFFSET + KEY_BYTES;
const VALUE_IV_OFFSET = DEK_TAG_OFFSET + TAG_BYTES;
const VALUE_CIPHERTEXT_OFFSET = VALUE_IV_OFFSET + IV_BYTES;

const MIN_BLOB_SIZE = 1 + IV_BYTES + KEY_BYTES + TAG_BYTES + IV_BYTES + 0 + TAG_BYTES;

// Standard or URL-safe base64, with or without padding. Matches the
// shapes `openssl rand -base64 32` and `randomBytes(32).toString("base64")`
// produce, plus `toString("base64url")`. Anything else is operator error.
const BASE64_LIKE = /^[A-Za-z0-9+/_=-]+$/;

export function loadMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.BUENDIA_MASTER_KEY;
  if (!raw) {
    throw new Error("Missing required env var: BUENDIA_MASTER_KEY");
  }
  // `Buffer.from(raw, "base64")` silently ignores out-of-charset bytes —
  // a typo like a stray space inside the secret yields a too-short
  // key and a confusing length error downstream. Reject up front.
  // See SECURITY_AUDIT.md §L1.
  if (!BASE64_LIKE.test(raw)) {
    throw new Error("BUENDIA_MASTER_KEY must be base64-encoded (use `openssl rand -base64 32`)");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `BUENDIA_MASTER_KEY must decode to ${KEY_BYTES} bytes (base64); got ${key.length}`,
    );
  }
  return key;
}

export function encrypt(plaintext: string, masterKey: Buffer): Buffer {
  if (masterKey.length !== KEY_BYTES) {
    throw new Error(`master key must be ${KEY_BYTES} bytes`);
  }

  const dek = randomBytes(KEY_BYTES);
  const dekIv = randomBytes(IV_BYTES);
  const valueIv = randomBytes(IV_BYTES);

  const dekCipher = createCipheriv(ALGO, masterKey, dekIv);
  const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  const valueCipher = createCipheriv(ALGO, dek, valueIv);
  const ciphertext = Buffer.concat([valueCipher.update(plaintext, "utf8"), valueCipher.final()]);
  const valueTag = valueCipher.getAuthTag();

  return Buffer.concat([
    Buffer.from([VERSION]),
    dekIv,
    wrappedDek,
    dekTag,
    valueIv,
    ciphertext,
    valueTag,
  ]);
}

export function decrypt(blob: Buffer, masterKey: Buffer): string {
  if (masterKey.length !== KEY_BYTES) {
    throw new Error(`master key must be ${KEY_BYTES} bytes`);
  }
  if (blob.length < MIN_BLOB_SIZE) {
    throw new Error("ciphertext blob is too short to be valid");
  }
  if (blob[0] !== VERSION) {
    throw new Error(`unsupported credential blob version: ${blob[0]}`);
  }

  const dekIv = blob.subarray(DEK_IV_OFFSET, DEK_IV_OFFSET + IV_BYTES);
  const wrappedDek = blob.subarray(DEK_CIPHERTEXT_OFFSET, DEK_CIPHERTEXT_OFFSET + KEY_BYTES);
  const dekTag = blob.subarray(DEK_TAG_OFFSET, DEK_TAG_OFFSET + TAG_BYTES);
  const valueIv = blob.subarray(VALUE_IV_OFFSET, VALUE_IV_OFFSET + IV_BYTES);
  const valueCiphertext = blob.subarray(VALUE_CIPHERTEXT_OFFSET, blob.length - TAG_BYTES);
  const valueTag = blob.subarray(blob.length - TAG_BYTES);

  const dekDecipher = createDecipheriv(ALGO, masterKey, dekIv);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(wrappedDek), dekDecipher.final()]);

  const valueDecipher = createDecipheriv(ALGO, dek, valueIv);
  valueDecipher.setAuthTag(valueTag);
  const plaintext = Buffer.concat([valueDecipher.update(valueCiphertext), valueDecipher.final()]);

  return plaintext.toString("utf8");
}

/**
 * Generate a fresh master-key candidate (base64). Useful for the operator
 * setup step:
 *
 *   node --experimental-strip-types -e \\
 *     'import("./packages/db/src/credentials.ts").then(m => console.log(m.generateMasterKey()))'
 *
 * Or just `openssl rand -base64 32`.
 */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

/**
 * Render a Buffer as a PostgreSQL bytea literal (`\\x<hex>`).
 *
 * supabase-js sends the request body through `JSON.stringify`, which turns a
 * raw Node `Buffer` into the object form `{ "type": "Buffer", "data": [...] }`
 * — those bytes then end up sitting inside the `bytea` column verbatim, and
 * the next read can't decrypt them ("unsupported credential blob version:
 * 123" — 0x7b = `{`). Wrap every Buffer-bound write through this helper so
 * the value reaches PostgreSQL in its proper bytea-literal form.
 */
export function byteaLiteral(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}
