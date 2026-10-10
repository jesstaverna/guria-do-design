import { parseCents } from '@/lib/domain';

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const opt = (fd: FormData, k: string) => str(fd, k) || null;
export const uuid = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
};
export const date = (fd: FormData, k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(fd, k)) ? str(fd, k) : null);
export const cents = (fd: FormData, k: string) => parseCents(str(fd, k));
export const int = (fd: FormData, k: string, fallback = 0) => {
  const n = parseInt(str(fd, k), 10);
  return Number.isFinite(n) ? n : fallback;
};
export const pick = <T extends string>(fd: FormData, k: string, allowed: readonly T[], fallback: T): T => {
  const v = str(fd, k) as T;
  return allowed.includes(v) ? v : fallback;
};
