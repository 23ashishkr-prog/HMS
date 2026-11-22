/**
 * Offline licence — device side. Browser-safe (no secrets, no node:crypto).
 *
 * The device keeps the last licence the server signed for it. It can read the licence but not create or extend
 * one: the signature is checked by the server whenever offline work is synced. On the device we only decide
 * whether offline mode may start, using the server's clock (skew measured when the licence was issued) and never
 * letting time run backwards (so winding the device clock back does not buy more offline days).
 */
export const DAY_MS = 86_400_000;
/** Treat the connection as gone if the clock jumps back more than this (device clock wound back). */
const ROLLBACK_TOLERANCE_MS = 10 * 60_000;

export interface LicenceClaims { sid: string; uid?: string | null; plan: string; iat: number; until: number }

export type StoredLicence =
  | { kind: "licence"; token: string; claims: LicenceClaims; skewMs: number; lastSeen: number; checkedAt: number }
  | { kind: "locked"; status: string; checkedAt: number; lastSeen: number }
  | { kind: "disabled"; checkedAt: number; lastSeen: number };

export type OfflineMode =
  | { mode: "ready"; daysLeft: number; until: number; now: number }
  | { mode: "expired"; until: number; now: number }
  | { mode: "locked"; status: string; now: number }
  | { mode: "disabled"; now: number }
  | { mode: "none"; now: number };

/** Reads the claims part of a signed licence (base64url JSON before the dot). Does not — cannot — verify it. */
export function readClaims(token: string): LicenceClaims | null {
  try {
    const body = token.split(".")[0];
    const s = body.replace(/-/g, "+").replace(/_/g, "/");
    const txt = typeof atob === "function" ? decodeURIComponent(escape(atob(s))) : Buffer.from(body, "base64url").toString("utf8");
    const c = JSON.parse(txt);
    return typeof c?.until === "number" && typeof c?.iat === "number" && typeof c?.sid === "string" ? c : null;
  } catch { return null; }
}

/** Builds what the device stores from the server's answer. `deviceNow` is Date.now() when the answer arrived. */
export function fromServer(res: { token?: string; locked?: boolean; disabled?: boolean; status?: string; serverTime: number }, deviceNow: number, prev?: StoredLicence | null): StoredLicence | null {
  // A fresh answer from the server resets the clock guard: the server's clock is the authority.
  const lastSeen = res.serverTime;
  void prev;
  if (res.disabled) return { kind: "disabled", checkedAt: res.serverTime, lastSeen };
  if (res.locked) return { kind: "locked", status: res.status ?? "expired", checkedAt: res.serverTime, lastSeen };
  const claims = res.token ? readClaims(res.token) : null;
  if (!res.token || !claims) return null;
  return { kind: "licence", token: res.token, claims, skewMs: res.serverTime - deviceNow, lastSeen, checkedAt: res.serverTime };
}

/** Best estimate of the server's clock now; never earlier than the last time this device saw. */
export function trustedNow(rec: StoredLicence | null, deviceNow: number): number {
  if (!rec) return deviceNow;
  const skew = rec.kind === "licence" ? rec.skewMs : 0;
  return Math.max(deviceNow + skew, rec.lastSeen);
}

export function clockWoundBack(rec: StoredLicence | null, deviceNow: number): boolean {
  if (!rec) return false;
  const skew = rec.kind === "licence" ? rec.skewMs : 0;
  return deviceNow + skew < rec.lastSeen - ROLLBACK_TOLERANCE_MS;
}

/** Can offline mode start right now? */
export function offlineMode(rec: StoredLicence | null, deviceNow: number, shopId?: string): OfflineMode {
  const now = trustedNow(rec, deviceNow);
  if (!rec) return { mode: "none", now };
  if (rec.kind === "locked") return { mode: "locked", status: rec.status, now };
  if (rec.kind === "disabled") return { mode: "disabled", now };
  if (shopId && rec.claims.sid !== shopId) return { mode: "none", now };
  if (now > rec.claims.until) return { mode: "expired", until: rec.claims.until, now };
  return { mode: "ready", daysLeft: Math.max(0, Math.ceil((rec.claims.until - now) / DAY_MS)), until: rec.claims.until, now };
}

/** Remember how far time has got (call on every tick) so a wound-back clock can't reopen an expired licence. */
export function touch(rec: StoredLicence | null, deviceNow: number): StoredLicence | null {
  if (!rec) return rec;
  const now = trustedNow(rec, deviceNow);
  return now > rec.lastSeen ? { ...rec, lastSeen: now } : rec;
}

export function loadLicence(key: string): StoredLicence | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as StoredLicence) : null; } catch { return null; }
}

export function saveLicence(key: string, rec: StoredLicence | null) {
  try { if (rec) localStorage.setItem(key, JSON.stringify(rec)); else localStorage.removeItem(key); } catch { /* storage unavailable */ }
}
