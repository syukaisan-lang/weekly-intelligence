// Apply exactly the same editorial policy as the browser after every feed refresh.
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../weekly-priority-policy.js');
const root=path.join(__dirname,'..');
const file=path.join(root,'data/articles.json');
const payload=JSON.parse(fs.readFileSync(file,'utf8'));
const counts={};
for(const a of payload.articles){
  const result=policy.assess(a);
  a.priority_assessment=result;
  // Retain the upstream retrieval score for diagnosis, never present it as reading value.
  if(!/^editorial_v/.test(a.screening||''))a.retrieval_reading_score=a.reading_score;
  a.reading_score=result.score;
  a.grade=result.score>=8.7?'S':result.score>=7.2?'A':result.score>=5.5?'B':'C';
  a.reason=result.eligible?`${result.use}；${result.reason}`:result.reason;
  a.screening='editorial_v37';
  counts[result.decision]=(counts[result.decision]||0)+1;
}
payload.meta.priority_policy_version=policy.VERSION;
payload.meta.priority_policy_counts=counts;
payload.meta.priority_policy_updated_at=new Date().toISOString();
fs.writeFileSync(file,JSON.stringify(payload,null,2));
console.log(JSON.stringify({version:policy.VERSION,articles:payload.articles.length,counts}));
