const STORAGE_KEY = "samether_cp";

export function loadCp(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function addCp(earned: number): number {
  const next = Math.max(0, loadCp() + Math.max(0, Math.floor(earned)));
  localStorage.setItem(STORAGE_KEY, String(next));
  return next;
}

export function setCp(total: number): void {
  localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(total))));
}

export function resetCp(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const DAILY_DIST_PREFIX = "samether_daily_dist_";

export function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${DAILY_DIST_PREFIX}${yyyy}-${mm}-${dd}`;
}

export function addDailyDistance(meters: number): void {
  const key = getTodayKey();
  const current = parseFloat(localStorage.getItem(key) ?? "0") || 0;
  localStorage.setItem(key, String(current + Math.max(0, meters)));
}

export function getTodayDistance(): number {
  const raw = localStorage.getItem(getTodayKey());
  if (raw == null) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
