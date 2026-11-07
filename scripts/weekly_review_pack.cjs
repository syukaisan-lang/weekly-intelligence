// Public-only, bounded article batches for the scheduled reviewer. Do not
// include feedback, semantic vectors, generated recommendations or notes.
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../weekly-priority-policy.js');
const dir=path.join(__dirname,'../data/weekly-review');
const input=path.join(__dirname,'../data/articles.json');
const rows=JSON.parse(fs.readFileSync(input,'utf8')).articles;
const now=Date.now(),cutoff=now-7*86400000;
const time=a=>Date.parse(a.first_seen||a.published||'');
const active=rows.filter(a=>time(a)>=cutoff&&time(a)<=now).sort((a,b)=>time(b)-time(a)||String(a.id).localeCompare(String(b.id)));
const decisions={},batches=[];
fs.mkdirSync(dir,{recursive:true});
const size=16;
for(let i=0;i<active.length;i+=size){
  const batch=active.slice(i,i+size).map(a=>{
    const r=policy.assess(a);
    decisions[r.decision]=(decisions[r.decision]||0)+1;
    return {id:a.id,title:a.title,url:a.url,source:a.source,published:a.published||null,
      first_seen:a.first_seen||null,summary:String(a.summary||'').slice(0,850),
      content_excerpt:String(a.content_excerpt||'').slice(0,1500),
      content_completeness:a.content_completeness||null,source_signature:policy.sourceSignature(a),
      assessment:{decision:r.decision,kind:r.kind,eligible:r.eligible}};
  });
  const file='batch-'+String(batches.length+1).padStart(3,'0')+'.json';
  batches.push({file,articles:batch.length});
  fs.writeFileSync(path.join(dir,file),JSON.stringify(batch));
}
const names=new Set(batches.map(b=>b.file));
for(const f of fs.readdirSync(dir))
  if(/^batch-\d{3,}\.json$/.test(f)&&!names.has(f))fs.unlinkSync(path.join(dir,f));
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({
  policy_version:policy.VERSION,review_version:policy.REVIEW_VERSION,window_days:7,
  total:active.length,latest_seen:active.length?new Date(time(active[0])).toISOString():null,decisions,batches
},null,2)+'\n');
console.log(`Public weekly review: ${active.length} articles in ${batches.length} small batches`);
