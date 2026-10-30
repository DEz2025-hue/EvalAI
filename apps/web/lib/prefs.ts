/** Client-side notification preferences + read state (localStorage, per workspace+user). */

export type NotifPrefs = { activity: boolean; reports: boolean; reviews: boolean };

const PREFS_KEY = "evalai.notif.prefs";
const SEEN_KEY = "evalai.notif.seen";

const DEFAULT_PREFS: NotifPrefs = { activity: true, reports: true, reviews: true };

function readJson(key: string): Record<string, unknown> {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export function scopeKey(workspaceId: string | null, email: string | null): string {
  return `${workspaceId ?? "demo"}:${email ?? "anon"}`;
}

export function getNotifPrefs(): NotifPrefs {
  const raw = readJson(PREFS_KEY);
  return {
    activity: typeof raw.activity === "boolean" ? raw.activity : DEFAULT_PREFS.activity,
    reports: typeof raw.reports === "boolean" ? raw.reports : DEFAULT_PREFS.reports,
    reviews: typeof raw.reviews === "boolean" ? raw.reviews : DEFAULT_PREFS.reviews,
  };
}

export function setNotifPrefs(prefs: NotifPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function getLastSeen(scope: string): string | null {
  const raw = readJson(SEEN_KEY);
  return typeof raw[scope] === "string" ? (raw[scope] as string) : null;
}

export function setLastSeen(scope: string, iso: string): void {
  const raw = readJson(SEEN_KEY);
  raw[scope] = iso;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(raw));
  } catch {}
}
