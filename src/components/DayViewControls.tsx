import React from 'react';
import { DateSort, dayLabel, harareDay, previousDay, validDay } from '../utils/dateViews';

export function DayViewControls({ label, dates, day, onDayChange, sort, onSortChange }: {
  label: string; dates: string[]; day: string; onDayChange: (day: string) => void;
  sort?: DateSort; onSortChange?: (sort: DateSort) => void;
}) {
  const today = harareDay(), yesterday = previousDay(today);
  const counts = new Map<string, number>();
  dates.forEach(d => { if (validDay(d)) counts.set(d, (counts.get(d) || 0) + 1); });
  const recent = [...counts.keys()].sort().reverse().filter(d => d !== today && d !== yesterday).slice(0, 7);
  const options = [{ date: '', name: 'All dates', count: dates.length }, { date: today, name: 'Today', count: counts.get(today) || 0 }, { date: yesterday, name: 'Yesterday', count: counts.get(yesterday) || 0 }, ...recent.map(d => ({ date: d, name: dayLabel(d), count: counts.get(d) || 0 }))];
  return <section aria-label={`${label} day view`} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 no-print">
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs font-medium text-slate-700">{label} date <input aria-label={`${label} date filter`} type="date" value={day} onChange={e => onDayChange(e.target.value)} className="border border-slate-200 rounded px-2 py-1.5 ml-2" /></label>
      {onSortChange && <label className="text-xs font-medium text-slate-700">Sort <select aria-label={`${label} sort order`} value={sort} onChange={e => onSortChange(e.target.value as DateSort)} className="border border-slate-200 rounded px-2 py-1.5 ml-2 bg-white"><option value="newest">Newest date first</option><option value="oldest">Oldest date first</option><option value="entered">Recently entered first</option></select></label>}
      <span className="text-xs text-slate-500">{day ? `${dayLabel(day)} · ${counts.get(day) || 0} records` : `${dates.length} records across all dates`}{dates.length > [...counts.values()].reduce((a, b) => a + b, 0) && ' · Some dates not established'}</span>
    </div>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${label} daily groups`}>{options.map(o => <button key={o.date} type="button" aria-pressed={day === o.date} onClick={() => onDayChange(o.date)} className={`rounded border px-2.5 py-1.5 text-xs ${day === o.date ? 'bg-blue-700 border-blue-700 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{o.name} ({o.count})</button>)}</div>
  </section>;
}
