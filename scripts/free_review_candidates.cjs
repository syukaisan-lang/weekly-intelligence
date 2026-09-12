// Read-only source-policy pass for the no-API public-body retry stage.
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../weekly-priority-policy.js');
const file=process.argv[2]||path.join(__dirname,'..','data/articles.json');
const rows=JSON.parse(fs.readFileSync(file,'utf8')).articles||[];
const cutoff=Date.now()-7*86400000;
const ids=rows.filter(a=>{
  const seen=Date.parse(a.first_seen||a.published||'');
  return Number.isFinite(seen)&&seen>=cutoff&&seen<=Date.now()
    &&(!a.content_checked||String(a.content_excerpt||'').replace(/\s/g,'').length<160)
    &&policy.assess(a).decision==='待核验';
}).map(a=>String(a.id));
process.stdout.write(JSON.stringify(ids));
