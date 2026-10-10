const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const M=require('../weekly-sync-state-v42.js'),root=path.join(__dirname,'..');
const later={status:'later',status_origin:'human_v10',status_action:'status',status_updated_at:100,updated_at:100,later_interest_at:100,feedback:null,feedback_updated_at:1,feedback_reason:'later_interest',feedback_reason_updated_at:100};
const feedback={...later,status:'new',status_action:'positive_feedback_only',status_updated_at:200,updated_at:200,feedback:'more',feedback_updated_at:200,feedback_reason:'reusable',feedback_reason_updated_at:200};
const merged=M.mergeRecord(later,feedback);assert.equal(merged.status,'later');assert.equal(merged.feedback,'more');assert.equal(merged.feedback_reason,'reusable');
assert.deepEqual(merged,M.mergeRecord(feedback,later));
const removed={...later,status:'new',updated_at:300,status_updated_at:300};
assert.equal(M.mergeRecord(merged,removed).status,'new');assert.equal(M.mergeRecord(merged,removed).feedback,'more');assert.equal(M.mergeRecord(merged,removed).later_interest_at,100);
const cleared={...merged,feedback:null,feedback_updated_at:400,feedback_reason:null,feedback_reason_updated_at:400,updated_at:400};assert.equal(M.mergeRecord(cleared,merged).feedback,null);assert.equal(M.mergeRecord(cleared,merged).feedback_reason,null);
assert('a' in M.changes({a:{status:'new',feedback:null,updated_at:10}},{}),'cleared records remain tombstones');
assert.equal(Object.keys(M.normalizeMap(JSON.parse('{"__proto__":{"status":"later"}}'))).length,0);
// Equal global latest timestamp must not conceal a different unsynced article.
assert.deepEqual(Object.keys(M.changes({a:later,b:{...later,updated_at:90,status_updated_at:90}},{a:later})),['b']);
assert.equal(fs.readFileSync(path.join(root,'weekly-sync-state-v42.js'),'utf8'),fs.readFileSync(path.join(root,'supabase/functions/weekly-sync/state.js'),'utf8'));
const source=fs.readFileSync(path.join(root,'weekly-auto-sync-v42.js'),'utf8');
let cloud={},requests=[],hold=null,offline=false;
function device(initial={},key='test-code'){
  const values=new Map([['event_radar_sync_key_v1',key]]),listeners={},timers=[],state=structuredClone(initial);
  const ctx={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,AbortSignal,state,window:null,
    localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
    navigator:{get onLine(){return !offline}},document:{hidden:false,readyState:'loading',getElementById:()=>null,addEventListener:()=>{}},
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},rebuildPrefs:()=>{},render:()=>{},updateProgressTabs:()=>{},
    addEventListener:(k,fn)=>listeners[k]=fn,
    fetch:async(url,opt)=>{
      requests.push(opt.method);if(offline)throw Error('offline');
      if(opt.headers['x-sync-key']!=='test-code')return{status:401,ok:false};
      if(opt.method==='POST'){
        const incoming=JSON.parse(opt.body).state;if(hold){const h=hold;hold=null;await h();}
        cloud=M.mergeMap(cloud,incoming);
      }
      return{status:200,ok:true,json:async()=>({state:structuredClone(cloud)})};
    }
  };ctx.window=ctx;ctx.WeeklySyncMerge=M;vm.createContext(ctx);vm.runInContext(source,ctx);
  return{ctx,state,values,listeners,timers,save(id){ctx.weeklyBeforeStateSave(id);values.set('weekly_intelligence_state_v1',JSON.stringify(state));ctx.weeklyAfterStateSave();},sync(){return ctx.WeeklyAutoSync.sync({force:true});}};
}
(async()=>{
 const a=device({old:later}),b=device();
 assert.equal(a.ctx.WeeklyAutoSync.getKey(),'test-code','reuse existing activity binding');
 await a.sync();await b.sync();assert.equal(b.state.old.status,'later');assert.equal(b.state.old.later_interest_at,100);
 // Edit while an upload is pending. A second round must save the newer value.
 a.state.a={...later,updated_at:Date.now(),status_updated_at:Date.now()};a.save('a');
 hold=async()=>{a.state.a.status='read';a.state.a.status_action='status';a.save('a');};
 await a.sync();assert.equal(cloud.a.status,'read');await b.sync();assert.equal(b.state.a.status,'read');
 offline=true;b.state.b={...later,updated_at:Date.now(),status_updated_at:Date.now()};b.save('b');await b.sync();assert(!cloud.b);assert(JSON.parse(b.values.get('weekly_intelligence_state_v1')).b);
 offline=false;await b.sync();await a.sync();assert.equal(a.state.b.status,'later');
 // Independent feedback edit must not overwrite another device's current status.
 a.state.b.feedback='more';a.state.b.feedback_reason='work_direct';a.save('b');
 b.state.b.status='read';b.state.b.status_action='status';b.save('b');
 await Promise.all([a.sync(),b.sync()]);await a.sync();await b.sync();assert.equal(cloud.b.status,'read');assert.equal(cloud.b.feedback,'more');assert.equal(cloud.b.feedback_reason,'work_direct');
 a.state.b.feedback=null;a.state.b.feedback_reason=null;a.save('b');await a.sync();await b.sync();assert.equal(b.state.b.feedback,null);assert.equal(b.state.b.feedback_reason,null);
 const bad=device({},'wrong-code');const before=JSON.stringify(cloud);await bad.sync();assert.equal(JSON.stringify(cloud),before);
 assert.equal(requests.filter(x=>x==='POST').length>0,true);
 console.log('Auto sync passed: shared binding, legacy import, independent fields, clears, in-flight edits, two devices, offline recovery and invalid credentials.');
})().catch(e=>{console.error(e);process.exitCode=1;});
