import './qa-core.js';
const Q=(globalThis as any).PublicWorkQA;
const ORIGIN='https://syukaisan-lang.github.io';
const EXPECTED_HASH='15b50658d8ff8f7dbb1883b6b8cb496aec7f2e7a95150c7a0b2dce8630461ee4';
const DATA='https://syukaisan-lang.github.io/weekly-intelligence/data/';
const CORPUS=DATA+'work-system-qa-public.json';
const HEADERS={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type,x-sync-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
const reply=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
let corpus:any[]=[],corpusAt=0,corpusSnapshot='',corpusGeneration='';
const evidenceCache=new Map<string,any>();
const pages=new Map<string,any>(),robotsCache=new Map<string,any>(),recent=new Map<string,number>();
class QAError extends Error{constructor(public code:string,public status=400){super(code);}}
async function bounded(response:Response|Request,limit:number){
  const reader=response.body?.getReader();if(!reader)throw new QAError('empty_response',503);let size=0;const parts:Uint8Array[]=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new QAError('response_too_large',413);parts.push(value);}}finally{reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);
}
async function loadCorpus(){
  if(corpusAt&&Date.now()-corpusAt<300000)return corpus;
  const r=await fetch(CORPUS,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new QAError('corpus_unavailable',503);
  const raw=JSON.parse(await bounded(r,6000000));if(raw.meta?.public_only!==true)throw new QAError('corpus_unavailable',503);
  corpusGeneration=raw.meta.generation||'';corpus=(raw.articles||[]).filter((a:any)=>Q.publicURL(a.url)&&/^[0-9a-f]$/.test(a.shard)).map((a:any)=>({...a,_searchTitle:Q.clean(a.title).toLowerCase(),_searchBody:Q.clean([a.summary,...(a.search_terms||[])].join(' ')).toLowerCase()}));
  corpusAt=Date.now();corpusSnapshot=raw.meta?.generated_at||'';return corpus;
}
async function evidenceFor(row:any){
  if(!row.shard)return row;
  const key=corpusGeneration+':'+row.shard;let shard=evidenceCache.get(key);
  if(!shard){const r=await fetch(DATA+'work-system-qa-public/'+row.shard+'.json?v='+corpusGeneration,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new QAError('source_snapshot_unavailable');
    const parsed=JSON.parse(await bounded(r,3000000));if(parsed.meta?.generation!==corpusGeneration||parsed.meta?.public_only!==true)throw new QAError('source_snapshot_stale');
    shard=parsed.articles;if(evidenceCache.size>20)evidenceCache.clear();evidenceCache.set(key,shard);
  }
  const raw=shard[row.id];if(!raw||raw.url!==row.url)throw new QAError('source_snapshot_stale');
  return Q.publicArticle({...raw,content_excerpt:raw.text,content_completeness:raw.completeness});
}
async function publicFetch(url:string,maxBytes=1500000){
  let current=Q.publicURL(url);if(!current)throw new QAError('source_not_allowed');
  for(let n=0;n<4;n++){
    await checkRobots(current);
    const r=await fetch(current,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; WorkSystemKnowledgeQA/1.0)','Accept':'text/html,text/plain'},signal:AbortSignal.timeout(9000)});
    if(r.status>=300&&r.status<400){const next=Q.publicURL(new URL(r.headers.get('location')||'',current).href);await r.body?.cancel();if(!next)throw new QAError('source_redirect_not_allowed');current=next;continue;}
    if(!r.ok)throw new QAError(r.status===401||r.status===403?'source_restricted':'source_unavailable');
    if(!/text\/html|text\/plain|application\/xhtml/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw new QAError('source_not_readable');}
    return{url:current,html:await bounded(r,maxBytes)};
  }throw new QAError('source_redirect_not_allowed');
}
function robotsAllowed(text:string,path:string){
  const groups:any[]=[];let group:any=null,rulesStarted=false;
  for(const line of text.split(/\r?\n/)){const m=line.replace(/#.*/,'').match(/^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*$/i);if(!m)continue;const key=m[1].toLowerCase(),value=m[2];
    if(key==='user-agent'){if(!group||rulesStarted){group={agents:[],rules:[]};groups.push(group);rulesStarted=false;}group.agents.push(value.toLowerCase());}
    else if(group){rulesStarted=true;if(value)group.rules.push({allow:key==='allow',path:value});}
  }
  const specific=groups.filter(g=>g.agents.some((a:string)=>a!=='*'&&'worksystemknowledgeqa'.includes(a)));
  const active=specific.length?specific:groups.filter(g=>g.agents.includes('*'));let best=-1,allowed=true;
  for(const g of active)for(const r of g.rules){const pattern=r.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');try{if(new RegExp('^'+pattern).test(path)){const length=r.path.replace(/\*/g,'').length;if(length>best||length===best&&r.allow){best=length;allowed=r.allow;}}}catch{}}
  return allowed;
}
async function checkRobots(url:string){
  const u=new URL(url);let cached=robotsCache.get(u.origin);
  if(!cached||Date.now()-cached.at>3600000){
    const r=await fetch(u.origin+'/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{'User-Agent':'WorkSystemKnowledgeQA/1.0'}});
    if(r.status===404)cached={at:Date.now(),text:''};else if(r.ok)cached={at:Date.now(),text:await bounded(r,150000)};else throw new QAError('source_robots_unavailable');
    if(robotsCache.size>100)robotsCache.clear();robotsCache.set(u.origin,cached);
  }
  if(!robotsAllowed(cached.text,u.pathname+u.search))throw new QAError('source_robots_blocked');
}
function plain(html:string){return Q.clean(html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,n)=>Number(n)>0&&Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):''));}
async function fromPublicPage(url:string){
  if(pages.has(url))return pages.get(url);
  await checkRobots(url);const {html,url:resolved}=await publicFetch(url);
  if(resolved!==url)await checkRobots(resolved);
  if(/"isAccessibleForFree"\s*:\s*(?:false|"false")|(?:この先|続き|続きを読むには).{0,35}(?:有料|会員登録|ログイン)|(?:subscriber-only|data-paywall)/i.test(html))throw new QAError('source_restricted');
  const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'公開記事');
  const area=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if(!area)throw new QAError('source_body_unverified');
  const text=plain(area).slice(0,16000);if(text.length<180)throw new QAError('source_body_unverified');
  const date=html.match(/(?:datePublished|article:published_time)["'][^>]{0,100}?(20\d{2}-\d{2}-\d{2})/i)?.[1]||'';
  const record={id:'url-'+(await sha(url)).slice(0,18),url:resolved,title,source:new URL(resolved).hostname,published:date,captured_at:new Date().toISOString(),text,summary:'',completeness:'public_excerpt'};
  if(pages.size>80)pages.clear();pages.set(url,record);return record;
}
async function sourcesFor(input:any,forAnswer=false){
  const rows=await loadCorpus(),selected:any[]=[],issues:any[]=[];
  const byURL=new Map(rows.map(a=>[a.url,a]));
  const fetched=await Promise.allSettled(input.source_urls.map(async(url:string)=>byURL.get(url)||await fromPublicPage(url)));
  fetched.forEach((result:any,i:number)=>{if(result.status==='fulfilled')selected.push(result.value);else issues.push({url:input.source_urls[i],status:result.reason instanceof QAError?result.reason.code:'source_unavailable'});});
  if(forAnswer){for(const id of input.source_ids){const row=rows.find(a=>a.id===id);if(row)selected.push(row);}}
  else if(input.scope!=='collection'){
    const query=[...input.history.filter((m:any)=>m.role==='user').map((m:any)=>m.content),input.question].slice(-3).join(' ');
    for(const a of Q.rankArticles(rows,query,8))if(!selected.some(s=>s.url===a.url))selected.push(a);
  }
  const unique=selected.filter((a,i)=>selected.findIndex(s=>s.url===a.url)===i).slice(0,8);
  const sources=[];
  for(const row of unique){try{const a=await evidenceFor(row);const text=Q.excerpt(a.text||a.summary,input.question,1700);if(text.length<60)continue;sources.push({id:a.id,ref:'S'+(await sha(a.url)).slice(0,12),url:a.url,title:a.title,source:a.source,published:a.published,captured_at:a.captured_at,completeness:a.text?a.completeness:'summary',text});}catch(e){issues.push({url:row.url,status:e instanceof QAError?e.code:'source_snapshot_unavailable'});}}
  return{sources,issues,corpus_size:rows.length,snapshot_at:corpusSnapshot};
}
function credentials(input:any){
  const configured=Deno.env.get(input.provider==='claude'?'WORK_SYSTEM_QA_ANTHROPIC_KEY':'WORK_SYSTEM_QA_GEMINI_KEY')||'';
  const api_key=input.api_key||configured;
  const model=input.model||Deno.env.get(input.provider==='claude'?'WORK_SYSTEM_QA_CLAUDE_MODEL':'WORK_SYSTEM_QA_GEMINI_MODEL')||'';
  if(!api_key)throw new QAError('model_not_configured',412);return{api_key,model};
}
async function providerFetch(url:string,init:RequestInit){
  const r=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(55000)});
  if(!r.ok){await r.body?.cancel();throw new QAError(r.status===401||r.status===403?'model_key_invalid':r.status===429?'model_quota_exceeded':'model_request_failed',r.status===429?429:502);}
  return JSON.parse(await bounded(r,200000));
}
async function models(input:any){
  const {api_key}=credentials(input);
  if(input.provider==='claude'){
    const r=await providerFetch('https://api.anthropic.com/v1/models?limit=100',{headers:{'x-api-key':api_key,'anthropic-version':'2023-06-01'}});
    return(r.data||[]).filter((x:any)=>x.id?.startsWith('claude-')).map((x:any)=>({id:x.id,name:x.display_name||x.id}));
  }
  const r=await providerFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':api_key}});
  return(r.models||[]).filter((x:any)=>(x.supportedGenerationMethods||[]).includes('generateContent')).map((x:any)=>({id:x.name.replace(/^models\//,''),name:x.displayName||x.name}));
}
async function answer(input:any,sources:any[]){
  const {api_key,model}=credentials(input);if(!model)throw new QAError('model_required',412);
  const prompt=Q.prompt(input.question,sources,input.history);let raw='';
  if(input.provider==='claude'){
    const result=await providerFetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':api_key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:2000,messages:[{role:'user',content:prompt}]})});
    if(result.stop_reason==='max_tokens')throw new QAError('answer_incomplete',502);raw=(result.content||[]).filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('\n');
  }else{
    const result=await providerFetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':api_key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:2200,responseMimeType:'application/json'}})});
    if(result.candidates?.[0]?.finishReason==='MAX_TOKENS')throw new QAError('answer_incomplete',502);raw=(result.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||'').join('\n');
  }
  try{return Q.parseAnswer(raw,sources);}catch(e){throw new QAError(String((e as Error).message),502);}
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:HEADERS});
  if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply({error:'origin_not_allowed'},403);
  const syncKey=req.headers.get('x-sync-key')||'';if(!syncKey||await sha(syncKey)!==EXPECTED_HASH)return reply({error:'unauthorized'},401);
  if(req.method==='GET')return reply({providers:{claude:{configured:!!Deno.env.get('WORK_SYSTEM_QA_ANTHROPIC_KEY'),model:Deno.env.get('WORK_SYSTEM_QA_CLAUDE_MODEL')||''},gemini:{configured:!!Deno.env.get('WORK_SYSTEM_QA_GEMINI_KEY'),model:Deno.env.get('WORK_SYSTEM_QA_GEMINI_MODEL')||''}},public_only:true,stores_conversation:false});
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  try{
    const raw=await bounded(req,60000);let input:any;try{input=Q.prepareRequest(JSON.parse(raw));}catch{throw new QAError('invalid_request');}
    if(input.action==='models')return reply({models:await models(input)});
    if(input.action==='answer'){
      credentials(input);const last=recent.get(EXPECTED_HASH)||0;if(Date.now()-last<4000)throw new QAError('too_many_requests',429);recent.set(EXPECTED_HASH,Date.now());
      if(!input.source_ids.length&&!input.source_urls.length)throw new QAError('sources_required');
      const evidence=await sourcesFor(input,true);if(!evidence.sources.length)throw new QAError('no_public_evidence',422);
      return reply({...await answer(input,evidence.sources),sources:evidence.sources,public_only:true});
    }
    return reply({...await sourcesFor(input),public_only:true});
  }catch(e){return reply({error:e instanceof QAError?e.code:'service_unavailable'},e instanceof QAError?e.status:503);}
});
