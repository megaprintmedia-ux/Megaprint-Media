import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDraft, draftStorageKey } from '../draftStore';
const defaults={title:'',amount:'',date:'2026-11-21',claimable:false,lines:[{description:'',quantity:'1',unitPrice:'0'}],sizes:{S:0,M:0}};
const raw=(values:unknown)=>JSON.stringify({version:1,savedAt:'2026-11-21T10:00:00Z',values});
test('draft keys isolate each account and form',()=>{
 assert.notEqual(draftStorageKey('user-a','expense'),draftStorageKey('user-b','expense'));
 assert.notEqual(draftStorageKey('user-a','expense'),draftStorageKey('user-a','job'));
 assert.equal(draftStorageKey('','expense'),'');
});
test('job details, dates, zero values and all invoice lines survive a roundtrip',()=>{
 const values={...defaults,title:'Incoming printing job',amount:'0.00',date:'2026-11-20',claimable:true,lines:[{description:'First line',quantity:'2',unitPrice:'10.50'},{description:'Second line',quantity:'1',unitPrice:'0'}],sizes:{S:3,M:0}};
 assert.deepEqual(decodeDraft(raw(values),defaults)?.values,values);
});
test('invalid or old draft payloads do not crash forms',()=>{
 for(const value of ['{broken','null','[]',JSON.stringify({version:99,values:defaults}),JSON.stringify({version:1,savedAt:'not-a-date',values:defaults})])assert.equal(decodeDraft(value,defaults),null);
 const draft=decodeDraft(raw({title:7,amount:'12.50',lines:'bad',sizes:{S:2,M:'wrong'},extra:'ignored'}),defaults)!;
 assert.equal(draft.values.title,'');assert.equal(draft.values.amount,'12.50');assert.deepEqual(draft.values.lines,defaults.lines);assert.deepEqual(draft.values.sizes,{S:2,M:0});assert.equal('extra'in draft.values,false);
});
test('new fields receive defaults without dropping saved work and long notes survive',()=>{
 assert.equal(decodeDraft(raw({title:'Keep me'}),defaults)?.values.title,'Keep me');
 assert.equal(decodeDraft(raw({title:'Keep me'}),defaults)?.values.date,'2026-11-21');
 const title='A'.repeat(30000);assert.equal(decodeDraft(raw({...defaults,title}),defaults)?.values.title,title);
});
