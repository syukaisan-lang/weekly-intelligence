const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const storage=new Map(),idle=[];
let writes=0,slowCalls=0,renders=0,metrics=0;const writesByKey={};
const state={};
const document={
  querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null,
  createElement:()=>({classList:{add(){},remove(){}},appendChild(){},style:{}}),body:{appendChild(){}}
};
const ctx={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,performance,
  state,document,setTimeout:()=>0,clearTimeout:()=>{},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{writes++;writesByKey[k]=(writesByKey[k]||0)+1;storage.set(k,v)}},
  requestIdleCallback:fn=>{idle.push(fn)},
  st:id=>state[id]||{status:'new',feedback:null},
  setStatus:()=>{slowCalls++},renderArticles:()=>{renders++},renderMetrics:()=>{metrics++},renderPrefs:()=>{},updateProgressTabs:()=>{},
  window:{setStatus:()=>{slowCalls++}}
};
ctx.window.setStatus=ctx.setStatus;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','weekly-interaction-performance-v40.js'),'utf8'),ctx);

assert.equal(ctx.setStatus({id:'a'},'later'),'later');
assert.equal(ctx.setStatus({id:'b'},'later'),'later');
assert.equal(writesByKey.weekly_intelligence_state_v1,2,'each Later action writes the canonical state exactly once');
assert.equal(writesByKey.weekly_intelligence_dirty_since_v1,1,'dirty marker is written only for the first unsynced action');
assert.equal(slowCalls,0,'Later action bypasses the legacy wrapper chain');
assert.equal(state.a.status,'later');assert.equal(state.a.status_origin,'human_v10');assert(state.a.later_interest_at>0);
assert.equal(idle.length,1,'rapid Later actions share one idle callback');
assert.deepEqual(ctx.window.weeklyInteractionPerformanceV40.stats().pending_actions,2);
idle.shift()();
assert.equal(renders,1);assert.equal(metrics,1);assert.equal(ctx.window.weeklyInteractionPerformanceV40.stats().batches,1);
const learned=state.a.later_interest_at;
assert.equal(ctx.setStatus({id:'a'},'later'),'new');
assert.equal(state.a.status,'new');assert.equal(state.a.later_interest_at,learned,'removing bookmark preserves interest history');
ctx.setStatus({id:'a'},'read');assert.equal(slowCalls,1,'non-Later statuses keep the established behavior');
console.log('Interaction performance regression checks passed: one write, immediate state, one idle batch, safe fallback chain.');
