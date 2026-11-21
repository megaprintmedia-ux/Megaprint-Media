export interface FormDraft<T> { version: 1; savedAt: string; values: T }
export function draftStorageKey(userId: string, form: string): string {
  return userId && form ? `megaprint:draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(form)}` : '';
}
function checkedValue(saved: unknown, fallback: unknown): unknown {
  if (typeof fallback === 'string') return typeof saved === 'string' ? saved : fallback;
  if (typeof fallback === 'number') return typeof saved === 'number' && Number.isFinite(saved) ? saved : fallback;
  if (typeof fallback === 'boolean') return typeof saved === 'boolean' ? saved : fallback;
  if (Array.isArray(fallback)) {
    if (!Array.isArray(saved) || saved.length > 100) return fallback;
    return saved.map(value => checkedValue(value, fallback[0] ?? ''));
  }
  if (fallback && typeof fallback === 'object') {
    const source = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
    return Object.fromEntries(Object.entries(fallback).map(([key, value]) => [key, checkedValue(source[key], value)]));
  }
  return fallback;
}
export function decodeDraft<T extends object>(raw: string | null, defaults: T): FormDraft<T> | null {
  if (!raw || raw.length > 2000000) return null;
  try {
    const draft = JSON.parse(raw);
    if (draft.version !== 1 || typeof draft.savedAt !== 'string' || !Number.isFinite(Date.parse(draft.savedAt)) || !draft.values || typeof draft.values !== 'object' || Array.isArray(draft.values)) return null;
    return { version: 1, savedAt: draft.savedAt, values: checkedValue(draft.values, defaults) as T };
  } catch { return null; }
}
