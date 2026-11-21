import type { Job } from '../types/erp';

export type DateSort = 'newest' | 'oldest' | 'entered';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' });
export function validDay(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}
export function timestampMillis(value: unknown): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (!value || typeof value !== 'object') return 0;
  const t = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  const n = typeof t.toMillis === 'function' ? t.toMillis() : typeof t.seconds === 'number' ? t.seconds * 1000 + (t.nanoseconds || 0) / 1e6 : 0;
  return Number.isFinite(n) ? n : 0;
}
export function harareDay(value: Date = new Date()): string { return dayFormatter.format(value); }
export function previousDay(day = harareDay()): string {
  const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10);
}
export function getJobDay(job: Pick<Job, 'jobNumber' | 'legacySourceReference' | 'importRunId' | 'createdAt'>): { date: string; label: string } {
  // Imported records retain their historical reference date; migration time is not the job date.
  if (job.legacySourceReference || job.importRunId) {
    const match = (job.legacySourceReference || job.jobNumber).match(/^MPM-JC-(\d{4})-(\d{2})(\d{2})-/);
    const date = match ? validDay(`${match[1]}-${match[2]}-${match[3]}`) : '';
    return { date, label: date ? 'Reference date' : 'Date not established' };
  }
  const millis = timestampMillis(job.createdAt);
  return { date: millis ? harareDay(new Date(millis)) : '', label: millis ? 'Created' : 'Date not established' };
}
export function dayLabel(day: string): string {
  return validDay(day) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(day + 'T12:00:00Z')) : 'Date not established';
}
export function datedRecords<T extends { id: string; createdAt?: unknown }>(records: T[], getDay: (record: T) => string, day: string, sort: DateSort): T[] {
  return records.filter(record => !day || validDay(getDay(record)) === day).sort((a, b) => {
    if (sort !== 'entered') {
      const ad = validDay(getDay(a)), bd = validDay(getDay(b));
      if (Boolean(ad) !== Boolean(bd)) return ad ? -1 : 1;
      const delta = ad.localeCompare(bd);
      if (delta) return sort === 'oldest' ? delta : -delta;
    }
    return timestampMillis(b.createdAt) - timestampMillis(a.createdAt) || b.id.localeCompare(a.id, undefined, { numeric: true });
  });
}
