// Verify that prior private choices can recover later choices. Only aggregate
// counters leave CI; the cache, IDs, examples and decisions are never published.
const fs=require('node:fs');
const policy=require('../weekly-priority-policy.js');
const learning=require('../weekly-feedback-learning-v38.js');
const cache=process.env.WEEKLY_CLOUD_STATE_PATH;
if(!cache||!fs.existsSync(cache)){
  console.log('Weekly feedback recall: cloud unavailable; historical comparison skipped.');
  process.exit(0);
}
const state=JSON.parse(fs.readFileSync(cache,'utf8'));
const rows=require('../data/articles.json').articles;
const DAY=86400000,now=Date.now(),cutoff=now-28*DAY;
const seen=a=>Date.parse(a.first_seen||a.published||'')||0;
const actionAt=s=>Math.max(Number(s.updated_at||0),Number(s.later_interest_at||0),
  Number(s.feedback_reason_updated_at||0),Number(s.feedback_updated_at||0),Number(s.status_updated_at||0));
const before=(a,at)=>{
  const s=state[a.id];
  return s&&seen(a)<at&&actionAt(s)>0&&actionAt(s)<at?s:{};
};
// Training and evaluation never share choices from the same calendar day.
// Unknown (unmarked) articles are excluded from the denominator.
const models=new Map(),report={positive_labeled:0,negative_labeled:0,
  previous:{positive_hits:0,negative_hits:0},current:{positive_hits:0,negative_hits:0}};
const qualifies=r=>r.eligible&&r.score>=7.2;
for(const a of rows){
  const s=state[a.id]||{};
  const negative=['bad','less'].includes(s.feedback);
  const positive=!negative&&s.status!=='skip'&&(s.status==='later'||s.status==='save'||
    Number(s.later_interest_at||0)>0||s.feedback_reason==='manual_b_pick'||s.feedback==='more');
  if(!(negative||positive)||seen(a)<cutoff||seen(a)>now||actionAt(s)<seen(a))continue;
  const day=Math.floor(seen(a)/DAY)*DAY;
  if(!models.has(day)){
    const prior=x=>before(x,day);
    models.set(day,[learning.makeModel(rows,prior,day,{precision:false}),learning.makeModel(rows,prior,day)]);
  }
  const [previous,current]=models.get(day);
  const oldResult=learning.finalAssessment(a,policy.assessBase(a),previous.explain(a),{precision:false});
  const newResult=learning.finalAssessment(a,policy.assess(a),current.explain(a));
  const label=positive?'positive':'negative';
  report[label+'_labeled']++;
  report.previous[label+'_hits']+=Number(qualifies(oldResult));
  report.current[label+'_hits']+=Number(qualifies(newResult));
}
console.log('Weekly precision holdout (28 days; chronological, labeled only; previous vs current): '+JSON.stringify(report));
