import test from 'node:test';
import assert from 'node:assert/strict';
import { datedRecords, getJobDay, harareDay, previousDay, validDay } from '../dateViews';
test('Harare midnight and calendar boundaries use the local business day', () => {
 assert.equal(harareDay(new Date('2026-11-20T22:30:00Z')), '2026-11-21');
 assert.equal(previousDay('2026-03-01'), '2026-02-28');
 assert.equal(validDay('2026-02-30'), '');
 assert.equal(validDay('2026-13-01'), '');
});
test('migration timestamps never become historical job dates', () => {
 const migrated = {jobNumber:'MPM-JC-2026-1012-005',legacySourceReference:'MPM-JC-2026-1012-005',createdAt:new Date('2026-11-21')};
 assert.deepEqual(getJobDay(migrated), {date:'2026-10-12',label:'Reference date'});
 assert.deepEqual(getJobDay({...migrated,jobNumber:'MJ131',legacySourceReference:'MJ131'}), {date:'',label:'Date not established'});
 assert.equal(getJobDay({jobNumber:'MP-2026-1047',createdAt:new Date('2026-11-20')}).date,'2026-11-20');
});
test('newest-date sorting breaks ties by entry time and keeps undated history last',()=>{
 const records=[{id:'old',date:'2026-11-19',createdAt:new Date('2026-11-21')},{id:'new',date:'2026-11-20',createdAt:new Date('2026-11-20T12:00Z')},{id:'newer',date:'2026-11-20',createdAt:new Date('2026-11-20T13:00Z')},{id:'unknown',date:'',createdAt:new Date('2026-11-21')}];
 assert.deepEqual(datedRecords(records,r=>r.date,'','newest').map(r=>r.id), ['newer','new','old','unknown']);
 assert.deepEqual(datedRecords(records,r=>r.date,'','oldest').map(r=>r.id), ['old','newer','new','unknown']);
 assert.equal(records[0].id,'old');
});
test('day selection includes both payments on that day and preserves original balances',()=>{
 const entries=[{id:'p1',date:'2026-11-19',balance:100},{id:'p2',date:'2026-11-20',balance:80},{id:'p3',date:'2026-11-20',balance:60},{id:'p4',date:'2026-11-21',balance:90}];
 const view=datedRecords(entries,r=>r.date,'2026-11-20','newest');
 assert.deepEqual(view.map(r=>r.id),['p3','p2']);assert.deepEqual(view.map(r=>r.balance),[60,80]);
 assert.equal(datedRecords(entries,r=>r.date,'2026-11-22','newest').length,0);
});
