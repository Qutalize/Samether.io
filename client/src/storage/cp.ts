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

export function resetCp(): void {
  localStorage.removeItem(STORAGE_KEY);
}
