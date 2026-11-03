// Read-only production smoke check. GitHub OIDC is restricted to public retrieval in the Edge Function.
import fs from 'node:fs';
const endpoint='https://cjcnjcblipqsyzxvlbus.supabase.co/functions/v1/work-system-qa';
const expected=JSON.parse(fs.readFileSync('data/work-system-qa-public.json','utf8')).meta.generation;
let ready=false;
for(let attempt=0;attempt<18;attempt++){
  const r=await fetch('https://syukaisan-lang.github.io/weekly-intelligence/data/work-system-qa-public.json?v='+expected,{signal:AbortSignal.timeout(15000)});
  if(r.ok){const d=await r.json();if(d.meta?.generation===expected){ready=true;break;}}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!ready)throw Error('The matching public evidence snapshot has not reached Pages yet');
const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','work-system-qa-read');
const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('GitHub OIDC request failed');const {value:token}=await response.json();
const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'retrieve',question:'ROAS下降但自然销售增长，先查什么？',scope:'combined'}),signal:AbortSignal.timeout(60000)});
const result=await r.json();if(!r.ok||!result.sources?.length||!result.public_only)throw Error('Live public retrieval failed: '+r.status+' '+(result.error||''));
console.log('Live public QA retrieval passed: '+result.sources.length+' evidence sources from '+result.corpus_size+' public articles. No model inference requested.');
const denied=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'answer',question:'ROAS下降',source_ids:[result.sources[0].id],provider:'claude',model:'claude-haiku-4-5'}),signal:AbortSignal.timeout(15000)});
if(denied.status!==403)throw Error('CI must not have permission to invoke a paid model');
console.log('CI cannot invoke model generation; owner device authentication is required.');
