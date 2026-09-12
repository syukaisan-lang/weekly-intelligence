// Fast home payload: full source evidence for this week, compact historical
// vectors/metadata for local preference learning. Full history remains in
// articles.json and is loaded only when a historical view is requested.
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const input=process.argv[2]||path.join(root,'data/articles.json');
const output=process.argv[3]||path.join(root,'data/articles-brief.json');
const payload=JSON.parse(fs.readFileSync(input,'utf8'));
const cutoff=Date.now()-7*86400000;
const keep=['id','url','title','source','category','published','first_seen','summary',
  'learning_features','semantic_vector','estimated_reading_minutes','reading_time_minutes',
  'reading_time_source','reading_score','notion_score','grade','content_archived','storage_tier'];
let recent=0;
const articles=payload.articles.map(a=>{
  const seen=Date.parse(a.first_seen||a.published||'');
  if(Number.isFinite(seen)&&seen>=cutoff){recent++;return a;}
  const brief=Object.fromEntries(keep.filter(key=>a[key]!==undefined).map(key=>[key,a[key]]));
  brief.summary=String(brief.summary||'').slice(0,500);
  if(a.knowledge_context?.increment_type)brief.knowledge_context={increment_type:a.knowledge_context.increment_type};
  brief.content_checked=false;
  return brief;
});
payload.meta={...payload.meta,home_payload:'weekly_full_plus_history_index',home_recent_count:recent};
payload.articles=articles;
fs.writeFileSync(output,JSON.stringify(payload));
console.log(JSON.stringify({recent,history:articles.length-recent,bytes:fs.statSync(output).size}));
