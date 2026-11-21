import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { decodeDraft, draftStorageKey } from '../utils/draftStore';

export function useFormDraft<T extends object>({ form, active, values, restore, restoreOnOpen = true }: {
  form: string; active: boolean; values: T; restore: (values: T) => void; restoreOnOpen?: boolean;
}) {
  const { user } = useAuth();
  const key = draftStorageKey(user?.uid || '', form);
  const [savedAt, setSavedAt] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const latest = useRef({ active, values, restore, restoreOnOpen });
  latest.current = { active, values, restore, restoreOnOpen };
  const baseline = useRef('');
  const serialized = JSON.stringify(values);

  function save() {
    if (!key) { setNotice('Sign in to save a draft.'); return false; }
    try {
      const time = new Date().toISOString();
      const encoded = JSON.stringify({ version: 1, savedAt: time, values: latest.current.values });
      if (encoded.length > 2000000) throw new Error('Draft is too large');
      localStorage.setItem(key, encoded);
      baseline.current = JSON.stringify(latest.current.values);
      setSavedAt(time); setNotice('Draft saved. You can close this form and return later.');
      return true;
    } catch { setNotice('Draft could not be saved in this browser. Keep this form open.'); return false; }
  }
  function clear() {
    try {
      if (key) localStorage.removeItem(key);
      baseline.current = JSON.stringify(latest.current.values);
      setSavedAt(''); setNotice('Saved draft deleted. Current form entries are still here.');
    } catch { setNotice('Saved draft could not be deleted.'); }
  }
  useEffect(() => {
    if (!key) return;
    const refresh = () => {
      try { setSavedAt(decodeDraft(localStorage.getItem(key), latest.current.values)?.savedAt || ''); }
      catch { setNotice('Draft storage is unavailable in this browser.'); }
    };
    refresh();
    const onStorage = (event: StorageEvent) => { if (event.key === key) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);
  useEffect(() => {
    setReady(false);
    if (!active || !key) return;
    baseline.current = latest.current.restoreOnOpen ? JSON.stringify(latest.current.values) : '';
    try {
      const draft = decodeDraft(localStorage.getItem(key), latest.current.values);
      if (draft && latest.current.restoreOnOpen) {
        latest.current.restore(draft.values); setSavedAt(draft.savedAt); setNotice('Saved draft restored. Continue where you left off.');
      } else setNotice('Changes are saved automatically on this browser.');
    } catch { setNotice('Draft storage is unavailable in this browser.'); }
    setReady(true);
  }, [key, active]);
  useEffect(() => {
    if (active && ready && key && serialized !== baseline.current) save();
  }, [key, active, ready, serialized]);
  useEffect(() => {
    const preserve = () => {
      if (!key || !latest.current.active) return;
      const current = JSON.stringify(latest.current.values);
      if (current === baseline.current) return;
      try { localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), values: latest.current.values })); }
      catch { /* Keep the current form available when storage is full. */ }
    };
    window.addEventListener('beforeunload', preserve);
    return () => { preserve(); window.removeEventListener('beforeunload', preserve); };
  }, [key]);
  return { hasDraft: Boolean(savedAt), savedAt, notice, save, clear };
}

type DraftState = ReturnType<typeof useFormDraft>;
export function DraftControls({ draft, label, active, onResume }: { draft: DraftState; label: string; active: boolean; onResume: () => void }) {
  if (!active && !draft.hasDraft) return null;
  return <section aria-label={`${label} draft`} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs space-y-2 no-print">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><strong>{label} draft</strong><span className="text-slate-600 ml-2">{draft.savedAt ? `Saved ${new Date(draft.savedAt).toLocaleString('en-GB', { timeZone: 'Africa/Harare' })}` : 'Automatic saving enabled'}</span></div>
      <div className="flex gap-2">{active ? <button type="button" onClick={draft.save} className="rounded bg-blue-700 px-3 py-1.5 text-white font-semibold">Save Draft</button> : <button type="button" onClick={onResume} className="rounded bg-blue-700 px-3 py-1.5 text-white font-semibold">Resume Draft</button>}{draft.hasDraft && <button type="button" onClick={draft.clear} className="rounded border border-blue-200 px-3 py-1.5 text-slate-700">Delete Saved Draft</button>}</div>
    </div>
    <p role="status" className="text-slate-600">{draft.notice || 'An unfinished entry is available.'} Drafts are saved for your account on this browser.</p>
  </section>;
}
