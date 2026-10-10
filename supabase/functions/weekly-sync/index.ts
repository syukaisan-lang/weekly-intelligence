import './state.js';
const merge = (globalThis as any).WeeklySyncMerge;
const EXPECTED_HASH = '15b50658d8ff8f7dbb1883b6b8cb496aec7f2e7a95150c7a0b2dce8630461ee4';
const ORIGIN = 'https://syukaisan-lang.github.io';
const AUDIENCE = 'weekly-intelligence-sync';
const WORKFLOWS = new Set(['syukaisan-lang/weekly-intelligence/.github/workflows/update.yml@refs/heads/main','syukaisan-lang/weekly-intelligence/.github/workflows/public-body-retry.yml@refs/heads/main']);
const headers = {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type,x-sync-key,authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
let jwks:any=null,jwksAt=0;
async function authorized(req:Request){
  const key=req.headers.get('x-sync-key')||'';
  if(key){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));return Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('')===EXPECTED_HASH;}
  // GitHub Actions can migrate its existing encrypted backup and read feedback for learning,
  // without putting a device sync code or server key in GitHub or public source.
  try{
    const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');const [head,payload,sig]=token.split('.');
    const h=JSON.parse(new TextDecoder().decode(decode(head))),p=JSON.parse(new TextDecoder().decode(decode(payload))),now=Date.now()/1000;
    if(h.alg!=='RS256'||p.iss!=='https://token.actions.githubusercontent.com'||p.aud!==AUDIENCE||p.exp<=now||p.nbf>now+30||p.iat<now-600||p.repository!=='syukaisan-lang/weekly-intelligence'||p.ref!=='refs/heads/main'||!WORKFLOWS.has(p.workflow_ref)||!['push','schedule','workflow_dispatch','workflow_run'].includes(p.event_name))return false;
    if(!jwks||Date.now()-jwksAt>3600000){const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{signal:AbortSignal.timeout(5000)});if(!r.ok)return false;jwks=await r.json();jwksAt=Date.now();}
    const k=jwks.keys.find((v:any)=>v.kid===h.kid);if(!k)return false;
    const pub=await crypto.subtle.importKey('jwk',k,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pub,decode(sig),new TextEncoder().encode(head+'.'+payload));
  }catch{return false;}
}
async function db(path:string,options:RequestInit={}){
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/weekly_feedback_state'+path,{...options,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply({error:'origin_not_allowed'},403);
  if(!['GET','POST'].includes(req.method))return reply({error:'method_not_allowed'},405);
  if(!await authorized(req))return reply({error:'unauthorized'},401);
  try{
    let incoming:any={};
    if(req.method==='POST'){
      const raw=await req.text();if(raw.length>2000000)return reply({error:'payload_too_large'},413);
      const body=JSON.parse(raw);if(!body.state||typeof body.state!=='object'||Array.isArray(body.state)||Object.keys(body.state).length>5000)return reply({error:'invalid_state'},400);
      incoming=merge.normalizeMap(body.state);
      if(Object.keys(incoming).length!==Object.keys(body.state).length)return reply({error:'invalid_records'},400);
      for(const v of Object.values(incoming) as any[])for(const k of ['updated_at','status_updated_at','feedback_updated_at','feedback_reason_updated_at','later_interest_at'])if(v[k]>Date.now()+300000)return reply({error:'device_clock_ahead'},400);
    }
    for(let attempt=0;attempt<8;attempt++){
      const r=await db('?profile_id=eq.default&select=state,revision,updated_at');if(!r.ok)throw Error('read_failed');
      const row=(await r.json())[0];if(!row)throw Error('profile_missing');
      if(req.method==='GET')return reply({state:row.state,revision:row.revision,updated_at:row.updated_at});
      const state=merge.mergeMap(row.state,incoming);if(Object.keys(state).length>20000)return reply({error:'record_limit'},413);
      if(JSON.stringify(state)===JSON.stringify(row.state))return reply({state,revision:row.revision,updated_at:row.updated_at});
      const saved=await db('?profile_id=eq.default&revision=eq.'+row.revision,{method:'PATCH',body:JSON.stringify({state,revision:row.revision+1,updated_at:new Date().toISOString()})});if(!saved.ok)throw Error('write_failed');
      const rows=await saved.json();if(rows.length)return reply(rows[0]);
      // Compare-and-swap failed because another device saved: re-read and merge before retry.
    }
    return reply({error:'concurrent_retry'},409);
  }catch{return reply({error:'sync_unavailable'},503);}
});
