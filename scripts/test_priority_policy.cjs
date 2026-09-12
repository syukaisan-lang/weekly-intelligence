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
assert.equal(policy.assess(article('c5b40d1098c65903cf')).kind,'diagnostic','evidence-backed qualitative diagnostics matter without a measured case outcome');
assert.equal(policy.assess({...method,content_checked:false}).eligible,false);
assert.equal(policy.assess({...method,content_excerpt:'本文を読む'}).eligible,false);
assert.deepEqual(policy.assess({...event,reason:'工作相关 数据 方法 分析 EC AI',reading_score:10,knowledge_context:{increment_type:'direct_work_use'}}),policy.assess(event));
assert.equal(policy.assess({...measured,source:'Unknown source'}).score,policy.assess(measured).score);
assert.equal(policy.assess({...measured,content_completeness:'partial'}).cap,8.6);
const selected=policy.select(articles);
assert(selected.length>5, "all qualifying articles must remain available beyond the fifth");
assert(selected.every(a=>policy.assess(a).evidence.length>=1));
assert.deepEqual(policy.select([event]),[],'no forced quota');
assert.deepEqual(policy.select([method],{budget:30,minutes:()=>31}),[],'never overflow budget');
assert.equal(policy.select([method,{...method,id:'duplicate',url:'https://another.example/story'}]).length,1);
assert(policy.select([method,measured]).includes(measured),'different articles remain distinct');
// A short survey must not be dropped solely because it is short.
assert(policy.assess(article('90235c8067f82e7bfb')).eligible);
// Distinct conclusions/angles with a similar title are not duplicates.
assert.equal(policy.sameStory(method,{...method,url:'https://another.example/story',content_excerpt:'別の結論を持つ記事。'.repeat(30)}),false);
const missed={...method,title:'タイトルに職種のキーワードがない記事',summary:'',content_excerpt:'具体的な比較手順と判断に使える新しい方法を説明する本文。'};
missed.priority_review={version:policy.VERSION,two_pass:true,source_signature:policy.sourceSignature(missed),verdict:'recommend',
 confidence:'medium',use:'用于评估竞品的定价差异',gain:'给出价格区间与转化分组的比较方法',evidence:[missed.content_excerpt]};
assert(policy.assess(missed).eligible,'content review can recover a keyword-missed article');
assert(!policy.assess({...missed,content_excerpt:'changed source'}).eligible,'stale review cannot certify changed source');
assert(!policy.assess({...missed,priority_review:{...missed.priority_review,evidence:['原文中不存在的一段没有依据的内容']}}).eligible,'invented evidence rejected');
// A public summary with an observed outcome and its implementation can be read
// without circumventing a paywall. A title or a polluted feed list cannot.
for(const id of ['f15b2cc0bfa93454a9','6ef6a8f7a7a3348653']){
  const a=article(id),result=policy.assess(a);
  assert.equal(result.kind,'summary_case',id);
  assert.equal(result.eligible,true,id);
  assert.equal(result.confidence,'medium',id);
  assert(result.evidence.every(q=>a.summary.includes(q)),id);
  assert(!policy.assess({...a,summary:''}).eligible,'title alone cannot certify value');
}
for(const id of ['b12149eb36cca97ca0','6c95ebf816b2870f75','5422e964416d3fbd7b']){
  assert(!policy.assess(article(id)).eligible,`polluted source or platform policy is not a deep read: ${id}`);
}
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
const cached=focus.currentFocus();
assert.strictEqual(focus.currentFocus(),cached,'unchanged view reuses its full-list selection');
elements.sourceFilter.value=method.source;
assert(focus.currentFocus().selected.every(a=>a.source===method.source),'source filter gets its own cache entry');
elements.sourceFilter.value='all';
assert.strictEqual(focus.currentFocus(),cached,'returning to a filter reuses the previous selection');
states[method.id]={status:'later'};focus.invalidate();
assert.equal(focus.currentFocus().selected.length,1,'Later leaves priority immediately');
states[measured.id]={feedback:'less'};focus.invalidate();
assert.equal(focus.currentFocus().selected.length,0,'rejected item cannot be refilled');
console.log('Priority regression checks passed: real misselections, source independence, evidence, no quota, no budget overflow, duplicates, contextual feedback and Later/list selection.');
