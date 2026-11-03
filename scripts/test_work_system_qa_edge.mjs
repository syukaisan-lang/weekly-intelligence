// Executes the actual Edge Function with in-memory HTTP stubs. Never calls a paid model.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
// Test the production authentication branch with a synthetic credential, never the user's code.
const expectedHash='15b50658d8ff8f7dbb1883b6b8cb496aec7f2e7a95150c7a0b2dce8630461ee4';
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:async(algorithm,bytes)=>{
 if(new TextDecoder().decode(bytes)==='test-only-valid-key')return Uint8Array.from(expectedHash.match(/../g),s=>parseInt(s,16)).buffer;
 return webcrypto.subtle.digest(algorithm,bytes);
},importKey:webcrypto.subtle.importKey.bind(webcrypto.subtle),verify:webcrypto.subtle.verify.bind(webcrypto.subtle)}}});
let handler,mode='valid',calls=[],ciJwk;
const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;
globalThis.Deno={env:{get:()=>undefined},serve:fn=>{handler=fn;}};
const now=new Date().toISOString();
const corpus={meta:{generated_at:now},articles:[{id:'a',url:'https://markezine.jp/article/detail/1',title:'ROASと自然検索売上を分けて考える',summary:'広告費用対効果と購買行動を比較する。'.repeat(8),content_excerpt:'広告費用対効果と自然検索売上を比較し、広告停止時の変化も検証する。'.repeat(20),content_completeness:'full',published:'2026-11-01',first_seen:now,reason:'PRIVATE-EXPERIENCE',comments:['PRIVATE-COMMENT'],knowledge_context:{memo:'PRIVATE-RULE'}}]};
globalThis.fetch=async(url,opts={})=>{
  url=String(url);calls.push({url,opts});
  if(url==='https://token.actions.githubusercontent.com/.well-known/jwks')return new Response(JSON.stringify({keys:[ciJwk]}));
  if(url.includes('/data/work-system-qa-public.json'))return new Response(JSON.stringify({meta:{public_only:true,generation:'fixture',generated_at:now},articles:corpus.articles.map(a=>({id:a.id,url:a.url,title:a.title,source:'MarkeZine',published:a.published,summary:a.summary,search_terms:['ROAS','自然検索','広告費用対効果'],shard:'a'}))}),{headers:{'content-type':'application/json'}});
  if(url.includes('/data/work-system-qa-public/a.json'))return new Response(JSON.stringify({meta:{public_only:true,generation:'fixture'},articles:Object.fromEntries(corpus.articles.map(a=>[a.id,{...a,text:a.content_excerpt,completeness:a.content_completeness}]))}),{headers:{'content-type':'application/json'}});
  if(url==='https://api.openai.com/v1/responses'){
    const body=JSON.parse(opts.body);assert(!JSON.stringify(body).includes('PRIVATE-'));assert.equal(body.max_output_tokens,4000);assert.equal(body.store,false);assert.equal(body.text.format.type,'json_object');assert.equal(opts.headers.Authorization,'Bearer fake-test-key');
    const match=body.input.match(/"reference":"(S[0-9a-f]+)"/);assert(match);
    const answer=mode==='bad-citation'?'证据[S000000000000]':mode==='no-citation'?'没有引用的观点':'公开资料建议分开检验广告与自然销售['+match[1]+']';
    if(mode==='incomplete')return new Response(JSON.stringify({status:'incomplete',output:[]}));
    return new Response(JSON.stringify({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify({answer,limitations:['不能证明因果'],follow_ups:['如何做对照？']})}]}]}));
  }
  if(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/')&&url.endsWith(':generateContent')){
    const payload=JSON.parse(opts.body),ref=payload.contents[0].parts[0].text.match(/\"reference\":\"(S[0-9a-f]+)\"/)[1];
    assert(!JSON.stringify(payload).includes('PRIVATE-'));assert.equal(opts.headers['x-goog-api-key'],'fake-test-key');
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answer:'仅能从公开资料提出待检验的假设['+ref+']',limitations:['缺少对照实验']})}]}}]}));
  }
  if(url==='https://api.openai.com/v1/models')return new Response(JSON.stringify({data:[{id:'gpt-5-test-mini',created:1},{id:'text-embedding-3-small',created:2},{id:'gpt-5-test-realtime',created:3}]}));
  if(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models?'))return new Response(JSON.stringify({models:[{name:'models/test-flash',supportedGenerationMethods:['generateContent']},{name:'models/embed',supportedGenerationMethods:['embedContent']}]}));
  if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /blocked\n', {headers:{'content-type':'text/plain'}});
  if(url==='https://markezine.jp/blocked')throw Error('robots restriction was bypassed');
  if(url==='https://markezine.jp/redirect')return new Response('',{status:302,headers:{location:'http://127.0.0.1/secret'}});
  if(url==='https://markezine.jp/paywall')return new Response('<script type="application/ld+json">{"isAccessibleForFree":false}</script><article>'+('秘密正文'.repeat(80))+'</article>',{headers:{'content-type':'text/html'}});
  if(url==='https://markezine.jp/public')return new Response('<title>公開された広告の検証方法</title><article>'+('広告費用対効果の検証に対照群を使う。'.repeat(50))+'</article>',{headers:{'content-type':'text/html'}});
  throw Error('Unexpected network request: '+url);
};
await import('../supabase/functions/work-system-qa/index.ts');
const key='test-only-valid-key';
async function request(body,options={}){
 const headers={'content-type':'application/json','x-sync-key':key,...options.headers};
 const req=new Request('https://test.invalid/work-system-qa',{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
 const r=await handler(req);return{status:r.status,body:await r.json()};
}
assert.equal((await request(undefined,{headers:{'x-sync-key':'bad'}})).status,401);
assert.equal((await request(undefined,{headers:{origin:'https://attacker.invalid'}})).status,403);
const status=await request();assert.equal(status.body.public_only,true);assert.equal(status.body.providers.openai.configured,false);
const noKey=await request({action:'answer',question:'ROAS下降',source_ids:['a'],model:'gpt-5-test-mini'});assert.equal(noKey.status,412);assert.equal(noKey.body.error,'model_not_configured');assert(!calls.some(c=>c.url.includes('/v1/responses')));
assert.equal((await request({action:'answer',question:'ROAS低下',private:'PRIVATE'})).status,400);
const retrieval=await request({action:'retrieve',question:'ROAS下降但自然销售增长，先查什么？'});assert.equal(retrieval.status,200);assert.equal(retrieval.body.sources[0].id,'a');assert(!JSON.stringify(retrieval.body).includes('PRIVATE-'));assert.equal(retrieval.body.snapshot_at,now);
const empty=await request({action:'retrieve',question:'足球袜',scope:'collection'});assert.deepEqual(empty.body.sources,[]);
const restricted=await request({action:'retrieve',question:'ROAS分析',scope:'collection',source_urls:['https://markezine.jp/blocked','https://markezine.jp/paywall','https://markezine.jp/redirect']});assert.equal(restricted.body.sources.length,0);assert.equal(restricted.body.issues.length,3);assert(!calls.some(c=>c.url.includes('127.0.0.1')));assert(!calls.some(c=>c.url==='https://markezine.jp/blocked'));
const fetched=await request({action:'retrieve',question:'广告验证',scope:'collection',source_urls:['https://markezine.jp/public']});assert.equal(fetched.body.sources.length,1);assert.equal(fetched.body.sources[0].completeness,'public_excerpt');
const models=await request({action:'models',provider:'openai',api_key:'fake-test-key'});assert.equal(models.body.models[0].id,'gpt-5-test-mini');assert.equal(models.body.models.length,1,'non-text models must be excluded');
const gm=await request({action:'models',provider:'gemini',api_key:'fake-test-key'});assert.equal(gm.body.models.length,1);
const answered=await request({action:'answer',question:'ROAS下降',source_ids:['a'],provider:'openai',api_key:'fake-test-key',model:'gpt-5-test-mini'});assert.equal(answered.status,200);assert(answered.body.citations.length);assert(!JSON.stringify(answered.body).includes('fake-test-key'));
offset+=5000;mode='bad-citation';
const badCitation=await request({action:'answer',question:'ROAS下降',source_ids:['a'],provider:'openai',api_key:'fake-test-key',model:'gpt-5-test-mini'});assert.equal(badCitation.status,502);assert.equal(badCitation.body.error,'invalid_citation');
offset+=5000;mode='incomplete';
const incomplete=await request({action:'answer',question:'ROAS下降',source_ids:['a'],provider:'openai',api_key:'fake-test-key',model:'gpt-5-test-mini'});assert.equal(incomplete.status,502);assert.equal(incomplete.body.error,'answer_incomplete');
offset+=5000;mode='valid';
const geminiAnswer=await request({action:'answer',question:'ROAS下降',source_ids:['a'],provider:'gemini',api_key:'fake-test-key',model:'test-flash'});assert.equal(geminiAnswer.status,200);assert(geminiAnswer.body.citations.length);
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
ciJwk={...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'ci-test-key'};
const claims={iss:'https://token.actions.githubusercontent.com',aud:'work-system-qa-read',exp:Math.floor(Date.now()/1000)+120,iat:Math.floor(Date.now()/1000),nbf:Math.floor(Date.now()/1000)-1,repository:'syukaisan-lang/weekly-intelligence',ref:'refs/heads/main',workflow_ref:'syukaisan-lang/weekly-intelligence/.github/workflows/work-system-qa-public.yml@refs/heads/main',event_name:'push'};
async function ciToken(payload){const h=Buffer.from(JSON.stringify({alg:'RS256',kid:ciJwk.kid})).toString('base64url'),p=Buffer.from(JSON.stringify(payload)).toString('base64url'),signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+Buffer.from(signature).toString('base64url');}
const token=await ciToken(claims),ciHeaders={'x-sync-key':'',authorization:'Bearer '+token};
assert.equal((await request({action:'retrieve',question:'ROAS下降'},{headers:ciHeaders})).status,200);
const beforePaid=calls.filter(c=>c.url.includes('/v1/responses')||c.url.includes(':generateContent')).length;
assert.equal((await request({action:'answer',question:'ROAS下降',source_ids:['a'],api_key:'fake-test-key',model:'gpt-5-test-mini'},{headers:ciHeaders})).status,403);
assert.equal(calls.filter(c=>c.url.includes('/v1/responses')||c.url.includes(':generateContent')).length,beforePaid);
const wrongRepo=await ciToken({...claims,repository:'someone/other'});assert.equal((await request({action:'retrieve',question:'ROAS下降'},{headers:{'x-sync-key':'',authorization:'Bearer '+wrongRepo}})).status,401);
console.log('Public QA Edge passed: auth, missing-model handling, public-only egress, corpus retrieval, robots/paywall/SSRF blocking, model listing and grounded answer adapter (mock model).');
