const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const policy=require('../weekly-priority-policy.js');
const articles=JSON.parse(fs.readFileSync(path.join(root,'data/articles.json'))).articles;
const article=id=>{const a=articles.find(x=>x.id===id);assert(a,`missing regression fixture ${id}`);return a;};
const event=article('3a49d0636275e486b9');
const method=article('76f61f1ec16a8ae7b2');
const measured=article('4281b6e2f2e860344a');
for(const id of ['3a49d0636275e486b9','509d0c61f6bf42c5ed','7ed22727b43fc307f1','a75468deb55640272b','194baa617969ff4b36','5527bec9a875be5ab4','3af46b71a5bacdc6ba']){
  assert.equal(policy.assess(article(id)).eligible,false,id);
}
assert(policy.assess(method).eligible);
assert(policy.assess(measured).eligible);
assert.equal(policy.assess({...method,content_checked:false}).eligible,false);
assert.equal(policy.assess({...method,content_excerpt:'本文を読む'}).eligible,false);
assert.deepEqual(policy.assess({...event,reason:'工作相关 数据 方法 分析 EC AI',reading_score:10,knowledge_context:{increment_type:'direct_work_use'}}),policy.assess(event));
assert.equal(policy.assess({...measured,source:'Unknown source'}).score,policy.assess(measured).score);
assert.equal(policy.assess({...measured,content_completeness:'partial'}).cap,8.6);
const selected=policy.select(articles);
assert(selected.length<=5);
assert(selected.every(a=>policy.assess(a).evidence.length>=2));
assert.deepEqual(policy.select([event]),[],'no forced quota');
assert.deepEqual(policy.select([method],{budget:30,minutes:()=>31}),[],'never overflow budget');
assert.equal(policy.select([method,{...method,id:'duplicate',url:'https://another.example/story'}]).length,1);
assert(policy.select([method,measured]).includes(measured),'different articles remain distinct');
// Execute real preference memory with a contextual event rejection and no browser storage.
const states={},storage=new Map();
const ctx={console,Date,Set,Map,Math,JSON,Number,String,Array,RegExp,
  data:{articles:[event,method,measured]},state:states,st:id=>states[id]||{},
  score:a=>a.reading_score,typedFeatures:a=>a.learning_features,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  document:{getElementById:()=>null},setTimeout:()=>{},
  window:{weeklyPriorityPolicy:policy,weeklyPreferenceGuardV30:{declaredGuard:()=>({cap:10}),learnedSuppression:()=>({cap:10})}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'weekly-preference-memory-v32.js'),'utf8'),ctx);
states[event.id]={feedback:'less',feedback_reason:'promo',feedback_reason_updated_at:Date.now()};
ctx.window.weeklyPreferenceMemoryV32.invalidate();
assert.equal(ctx.window.weeklyPreferenceMemoryV32.explain(method).hardNegative,false,'event dislike must not ban useful methods');
assert.equal(ctx.window.weeklyPreferenceMemoryV32.rescueIds().size,0);
assert(ctx.score(event)<7.2,'feedback must not promote an announcement');
assert(ctx.score(method)>=7.2,'useful method remains eligible');
// Execute actual v21 selection and status handling (same functions used by count/list).
const elements={gradeFilter:{value:'SA'},sourceFilter:{value:'all'},statusFilter:{value:'all'}};
for(const el of Object.values(elements))el.addEventListener=()=>{};
ctx.document.getElementById=id=>elements[id]||null;
ctx.grade=x=>x>=8.7?'S':x>=7.2?'A':x>=5.5?'B':'C';
const now=new Date().toISOString();
ctx.data.articles=[event,method,measured].map(a=>({...a,first_seen:now}));
vm.runInContext(fs.readFileSync(path.join(root,'weekly-reading-time-v21.js'),'utf8'),ctx);
const focus=ctx.window.weeklyReadingTimeV21;
assert.equal(focus.currentFocus().selected.length,2);
states[method.id]={status:'later'};focus.invalidate();
assert.equal(focus.currentFocus().selected.length,1,'Later leaves priority immediately');
states[measured.id]={feedback:'less'};focus.invalidate();
assert.equal(focus.currentFocus().selected.length,0,'rejected item cannot be refilled');
console.log('Priority regression checks passed: real misselections, source independence, evidence, no quota, no budget overflow, duplicates, contextual feedback and Later/list selection.');
