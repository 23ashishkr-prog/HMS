/**
 * Offline licence (server side).
 *
 * While a device is online the server hands it a signed licence: "hospital X may keep working offline until T",
 * where T = now + 30 days. The signature is an HMAC-SHA256 with a server-only key, so a browser can read the
 * licence but can never make a new one or push T further out. When T has passed the device must come online,
 * the server re-checks the subscription (getSubscription().usable, as everywhere else), and only a hospital whose
 * plan is usable gets a fresh licence.
 *
 * Offline writes carry the licence they were made under; on replay the server checks the signature, the hospital
 * and that the write happened before T, so a tampered device can't record sales from beyond its licence.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./services/core";
const DAY_MS = 86_400_000;

export const OFFLINE_DAYS = 30;
const VERSION = 1;

export interface OfflineLicence {
  v: number;
  /** Hospital the licence belongs to. */
  sid: string;
  /** Staff member it was issued to. */
  uid: string | null;
  /** Plan status when issued (HMS console vocabulary-free, e.g. ACTIVE / TRIAL / DEMO). */
  plan: string;
  /** Issued at (ms since epoch, server clock). */
  iat: number;
  /** Offline use allowed until (ms since epoch, server clock). */
  until: number;
}

export type VerifyResult = { ok: true; licence: OfflineLicence } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_tenant" };

/** Dedicated key if set, else SESSION_SECRET. Domain-separated so the raw secret is never the HMAC key. */
export function licenceKey(env: Record<string, string | undefined> = process.env): Buffer {
  const secret = env.OFFLINE_LICENCE_SECRET || env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("OFFLINE_LICENCE_SECRET or SESSION_SECRET (16+ chars) is required for offline licences.");
  return createHmac("sha256", secret).update("hms/offline-licence/v1").digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (body: string, key: Buffer) => createHmac("sha256", key).update(body).digest();

export function signLicence(licence: OfflineLicence, key: Buffer = licenceKey()): string {
  const body = b64(JSON.stringify(licence));
  return `${body}.${b64(mac(body, key))}`;
}

/** Checks the signature first, then (optionally) the hospital and expiry. `now` is the server clock. */
export function verifyLicence(token: string | null | undefined, opts: { key?: Buffer; now?: number; tenantId?: string; allowExpired?: boolean } = {}): VerifyResult {
  if (!token || typeof token !== "string" || token.length > 2000) return { ok: false, reason: "malformed" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const want = mac(body, opts.key ?? licenceKey());
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "bad_signature" };
  let licence: OfflineLicence;
  try { licence = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return { ok: false, reason: "malformed" }; }
  if (licence?.v !== VERSION || typeof licence.sid !== "string" || typeof licence.until !== "number" || typeof licence.iat !== "number") return { ok: false, reason: "malformed" };
  if (opts.tenantId && licence.sid !== opts.tenantId) return { ok: false, reason: "wrong_tenant" };
  if (!opts.allowExpired && (opts.now ?? Date.now()) > licence.until) return { ok: false, reason: "expired" };
  return { ok: true, licence };
}

export type IssueResult =
  | { ok: true; token: string; licence: OfflineLicence; serverTime: number }
  | { ok: false; locked: true; status: string; serverTime: number }
  | { ok: false; disabled: true; serverTime: number };

/**
 * Only if the hospital's plan is usable (active or trialing, not on hold — getSubscription().usable, the same rule
 * as every other API) does it get a licence valid for the next 30 days, unless the admin chose "Live mode".
 * Otherwise offline mode stays locked until the plan is renewed.
 */
export function issueLicence(input: { hospitalId: string; userId: string | null; usable: boolean; status: string; offlineEnabled?: boolean }, now = Date.now(), key: Buffer = licenceKey()): IssueResult {
  const status = input.status || "none";
  if (!input.usable) return { ok: false, locked: true, status, serverTime: now };
  // Admin picked "Live mode" in Settings: no offline licence, staff screens need internet.
  if (input.offlineEnabled === false) return { ok: false, disabled: true, serverTime: now };
  const licence: OfflineLicence = { v: VERSION, sid: input.hospitalId, uid: input.userId, plan: status, iat: now, until: now + OFFLINE_DAYS * DAY_MS };
  return { ok: true, token: signLicence(licence, key), licence, serverTime: now };
}

/**
 * For a write made offline and replayed later: the licence must be genuine, belong to this hospital, and the write
 * must have happened while it was valid (not before it was issued, not after it ran out). Expiry *now* doesn't
 * matter — a sale made on day 29 and synced on day 31 is still a real sale.
 */
export function checkOfflineWrite(token: string | null | undefined, hospitalId: string, occurredAt: Date, opts: { key?: Buffer; now?: number } = {}): VerifyResult {
  const r = verifyLicence(token, { key: opts.key, tenantId: hospitalId, allowExpired: true });
  if (!r.ok) return r;
  const t = occurredAt.getTime();
  const now = opts.now ?? Date.now();
  if (!Number.isFinite(t) || t < r.licence.iat - 5 * 60_000 || t > r.licence.until || t > now + 5 * 60_000) return { ok: false, reason: "expired" };
  return r;
}

/**
 * A write made offline and replayed from a device's queue carries x-offline-queued-at (when it was really made) and
 * the signed offline licence it was made under. It must fall inside that licence, so a device can't record work from
 * beyond its 30 days. Writes queued by the previous app version (no licence) are accepted for up to 7 days.
 */
export function checkOfflineReplay(req:Request,hospitalId:string,now=Date.now(),key?:Buffer){const at=Number(req.headers.get('x-offline-queued-at')||0);if(!at||now-at<120000)return;const lic=req.headers.get('x-offline-licence');if(!lic){if(now-at<=7*864e5)return;throw new HttpError(403,'This change was saved offline too long ago to be accepted without an offline licence.')}const r=checkOfflineWrite(lic,hospitalId,new Date(at),{now,key});if(!r.ok)throw new HttpError(403,r.reason==='expired'?"This change was made after the device's offline licence ran out.":'This offline change has no valid offline licence.')}
