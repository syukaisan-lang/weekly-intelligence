// Read-only source-policy pass for the no-API public-body retry stage.
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../weekly-priority-policy.js');
const file=process.argv[2]||path.join(__dirname,'..','data/articles.json');
const rows=JSON.parse(fs.readFileSync(file,'utf8')).articles||[];
const cutoff=Date.now()-14*86400000;
const ids=rows.filter(a=>{
  if(a.source==='日経クロストレンド 新着'||/^https?:\/\/xtrend\.nikkei\.com(?:\/|$)/i.test(a.url||''))return false;
  const seen=Date.parse(a.first_seen||a.published||'');
  return Number.isFinite(seen)&&seen>=cutoff&&seen<=Date.now()
    &&a.content_completeness!=='full'
    &&!['跳过','摘要足够'].includes(policy.assess(a).decision);
}).map(a=>String(a.id));
process.stdout.write(JSON.stringify(ids));
