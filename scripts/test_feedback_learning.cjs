const assert=require('node:assert/strict');
const engine=require('../weekly-feedback-learning-v38.js');
const policy=require('../weekly-priority-policy.js');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),now=Date.now();
const raw=JSON.parse(fs.readFileSync(path.join(root,'data/articles.json')));
const vector=raw.articles.find(x=>x.semantic_vector)?.semantic_vector;
assert(vector);
const distinct={...vector,q:Buffer.from(Buffer.from(vector.q,'base64').map(x=>255-x)).toString('base64')};
const mk=(id,title,v=vector,format='调査レポート')=>({id,title,first_seen:new Date(now).toISOString(),
  summary:'生成AIの業務活用に関する実証と方法',learning_features:{topics:['生成AI'],formats:[format],intents:[]},
  semantic_vector:v});
const event=mk('event','AIオンラインセミナー参加募集',vector,'セミナー');
const method=mk('method','生成AI業務活用の分析方法');
const related=mk('related','ChatGPTで業務改善を実証');
const unrelated=mk('unrelated','生成AI業務活用の別領域での実証',distinct);
const skipped=mk('skipped','生成AI業務活用の別例');
const states={event:{feedback:'less',feedback_reason:'promo',feedback_reason_updated_at:now},
  method:{status:'later',later_interest_at:now},
  skipped:{status:'skip',status_updated_at:now}};
const model=engine.makeModel([event,method,skipped],a=>states[a.id],now);
assert(model.explain(related).delta>0,'Later outweighs weak unrelated skip');
assert.equal(model.explain(unrelated).delta,0,'generic AI overlap alone cannot transfer preferences');
assert(model.explain(related).cap===10,'single negative never hard-suppresses a substantive article');
assert.equal(engine.family(event),'event');
assert.equal(engine.family(related),'substance');
// Explicit negative feedback is stronger when two matching articles are rejected.
const negativeA=mk('negativeA','生成AI業務活用の分析手法');
const negativeB=mk('negativeB','ChatGPT業務改善の分析手法');
const negState={negativeA:{feedback:'less',feedback_reason:'too_generic',feedback_reason_updated_at:now},
  negativeB:{feedback:'less',feedback_reason:'too_generic',feedback_reason_updated_at:now}};
const negative=engine.makeModel([negativeA,negativeB],a=>negState[a.id],now).explain(related);
assert(negative.delta<-.35,'two matching explicit negatives matter more than a single dislike');
assert(negative.cap<7.2,'repeated content-specific negatives can filter');
const alone=engine.makeModel([negativeA],a=>negState[a.id],now).explain(related);
assert(alone.delta>=-.35&&alone.cap===10,'single negative is only a light ranking signal');
const neutral=engine.makeModel([mk('read','生成AI業務活用の分析手法')],()=>({status:'read'}),now);
assert.equal(neutral.sampleCount,0,'completed read is not an endorsement');
const archived=mk('archived','生成AI業務活用の分析方法',null);
const older=engine.makeModel([archived],()=>({status:'later',later_interest_at:now-800*86400000}),now);
assert.equal(older.sampleCount,1,'old feedback remains in history after a year');
assert.equal(older.archivedSamples,1,'missing vectors are reported');
assert(older.explain(method).delta>0,'archived matching title still gives a weak positive signal');

// Execute the final browser adapter; the user's state stays local and changes
// invalidate the learned model without making a network request.
const data={articles:[event,method,related]},state={...states},storage=new Map();
let invalidations=0,saved=0;
const ctx={window:{weeklyFeedbackLearningV38:engine,weeklyPriorityPolicy:policy,
  weeklyReadingTimeV21:{invalidate:()=>invalidations++},weeklyUiFixesV25:{allRows:()=>data.articles}},
  data,state,st:id=>state[id]||{},score:()=>9,save:()=>{saved++;},document:{getElementById:()=>null}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'weekly-feedback-runtime-v38.js'),'utf8'),ctx);
assert.equal(ctx.window.weeklyFeedbackRuntimeV38.stats().samples,2);
assert.equal(ctx.window.weeklyFeedbackRuntimeV38.stats().unmatched_records,1,
  'the coverage diagnostic reports feedback on articles missing from the current library');
const rev=ctx.window.weeklyFeedbackRuntimeV38.stats().revision;
ctx.save();assert.equal(saved,1);assert(ctx.window.weeklyFeedbackRuntimeV38.stats().revision>rev);
assert(invalidations>=2);
console.log('Feedback learning regression checks passed: semantic specificity, reason context, positive/negative history, repeat threshold and cache invalidation.');
