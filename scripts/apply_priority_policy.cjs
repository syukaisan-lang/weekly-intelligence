// Apply exactly the same editorial policy as the browser after every feed refresh.
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../weekly-priority-policy.js');
const root=path.join(__dirname,'..');
const file=path.join(root,'data/articles.json');
const payload=JSON.parse(fs.readFileSync(file,'utf8'));
const counts={};
const weekStart=Date.now()-7*86400000;
const freeAudit={version:policy.VERSION,method:'source_rules',examined:0,recommended:0,summary_only:0,
  uncertain:0,brief:0,skipped:0,status:'complete_with_uncertainty'};
for(const a of payload.articles){
  const result=policy.assess(a);
  // The browser recomputes this assessment; serializing it per row inflates
  // the article download without adding evidence.
  delete a.priority_assessment;
  // Retain the upstream retrieval score for diagnosis, never present it as reading value.
  if(!/^editorial_v/.test(a.screening||''))a.retrieval_reading_score=a.reading_score;
  a.reading_score=result.score;
  a.grade=result.score>=8.7?'S':result.score>=7.2?'A':result.score>=5.5?'B':'C';
  a.reason=result.eligible?`${result.use}；${result.reason}`:result.reason;
  a.screening=`editorial_v${policy.VERSION}`;
  counts[result.decision]=(counts[result.decision]||0)+1;
  const ts=Date.parse(a.first_seen||a.published||'');
  if(Number.isFinite(ts)&&ts>=weekStart&&ts<=Date.now()){
    freeAudit.examined++;
    if(result.eligible){freeAudit.recommended++;if(result.kind==='summary_case')freeAudit.summary_only++;}
    else if(result.decision==='待核验')freeAudit.uncertain++;
    else if(result.decision==='跳过')freeAudit.skipped++;
    else freeAudit.brief++;
  }
}
freeAudit.checked_at=new Date().toISOString();
payload.meta.priority_policy_version=policy.VERSION;
payload.meta.priority_policy_counts=counts;
payload.meta.free_priority_audit=freeAudit;
payload.meta.priority_policy_updated_at=new Date().toISOString();
fs.writeFileSync(file,JSON.stringify(payload));
console.log(JSON.stringify({version:policy.VERSION,articles:payload.articles.length,counts,freeAudit}));
