const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Q=require('../work-system-qa-core.js'),root=path.join(__dirname,'..');
assert.equal(Q.publicURL('http://markezine.jp/article/detail/1?utm_source=test'), 'https://markezine.jp/article/detail/1');
for(const url of ['http://127.0.0.1/admin','https://10.0.0.1/','https://itmedia.co.jp.evil.example/','https://user:password@markezine.jp/','https://markezine.jp/?token=SECRET','https://example.notion.site/private','https://markezine.jp/preview/test','https://xtrend.nikkei.com/atcl/example'])assert.equal(Q.publicURL(url),'',url);
const publicRow=Q.publicArticle({id:'public-a',url:'https://markezine.jp/article/detail/1',title:'ROAS低下と自然検索売上',summary:'広告投資の検証',content_excerpt:'広告費用対効果とオーガニック売上を比較する。'.repeat(50),content_completeness:'full',reason:'PRIVATE-MEMO',knowledge_context:{secret:'PRIVATE-CONTEXT'},feedback_reason:'PRIVATE-FEEDBACK',comments:['PRIVATE-COMMENT'],semantic_vector:{q:'PRIVATE-VECTOR'},page_body:'PRIVATE-PAGE',topics:['PRIVATE-TOPIC']});
assert(!JSON.stringify(publicRow).includes('PRIVATE-'));
const items=[{title:'広告投資',summary:'PRIVATE-USER-SUMMARY',comments:[{text:'PRIVATE-COMMENTS'}],page_body:'Original URL: https://markezine.jp/article/detail/1\nWhy saved: PRIVATE-WHY\nROAS低下の事例'}];
assert.deepEqual(Q.collectionURLs(items,'ROAS下降'),['https://markezine.jp/article/detail/1']);
assert(!JSON.stringify(Q.collectionURLs(items,'ROAS下降')).includes('PRIVATE-'));
assert.deepEqual(Q.collectionURLs([{page_body:'Original URL: https://notion.so/private\nROAS'}],'ROAS'),[]);
const other=Q.publicArticle({id:'b',url:'https://markezine.jp/article/detail/2',title:'新しいカフェのイベント',summary:'限定キャンペーン'});
assert.equal(Q.rankArticles([other,publicRow],'ROAS下降但自然销售增长，先查什么？')[0].id,'public-a');
assert.equal(Q.rankArticles([publicRow],'足球袜五指长筒选什么')[0],undefined);
for(const extra of ['context','notes','private','system','page_body','sources'])assert.throws(()=>Q.prepareRequest({question:'ROAS低下',action:'answer',[extra]:'PRIVATE'}));
assert.throws(()=>Q.prepareRequest({question:'ROAS',model:'../secret'}));
assert.throws(()=>Q.prepareRequest({question:'ROAS',provider:'http://localhost'}));
const input=Q.prepareRequest({question:'ROAS低下',history:Array.from({length:9},()=>({role:'system',content:'user question'})),source_urls:['https://notion.so/private','https://markezine.jp/article/detail/1']});
assert.equal(input.history.length,4);assert(input.history.every(m=>m.role==='user'));assert.equal(input.source_urls.length,1);
const source={...publicRow,ref:'S123456789abc',text:'public evidence'};
assert(Q.prompt('广告如何优化',[source]).includes('public_sources'));
assert(!Q.prompt('广告如何优化',[source]).includes('PRIVATE-'));
assert.equal(Q.parseAnswer(JSON.stringify({answer:'公开证据显示需要比较[S123456789abc]。',follow_ups:['如何比较？']}),[source]).citations[0],source.ref);
assert.throws(()=>Q.parseAnswer(JSON.stringify({answer:'编造来源[S000000000000]。'}),[source]),/invalid_citation/);
assert.throws(()=>Q.parseAnswer(JSON.stringify({answer:'无依据断言。'}),[source]),/uncited_answer/);
assert.throws(()=>Q.parseAnswer('not JSON',[source]),/invalid_answer/);
assert.equal(fs.readFileSync(path.join(root,'work-system-qa-core.js'),'utf8'),fs.readFileSync(path.join(root,'supabase/functions/work-system-qa/qa-core.js'),'utf8'));
const ui=fs.readFileSync(path.join(root,'work-system-qa.js'),'utf8');assert(!/localStorage\.setItem\([^\n]*(?:apiKey|qaApiKey)/.test(ui),'API keys must never enter durable browser storage');
const os=require('node:os'),{execFileSync}=require('node:child_process'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'public-qa-test-'));
try{
 const input=path.join(temp,'articles.json'),out=path.join(temp,'out');
 fs.writeFileSync(input,JSON.stringify({meta:{generated_at:'2026-11-01'},articles:[{id:'public-a',url:'https://markezine.jp/article/detail/1',title:'広告効果とROAS',summary:'公開調査の内容',content_excerpt:'広告費用対効果の公開検証を示す。'.repeat(30),reason:'PRIVATE-MEMO',comments:['PRIVATE-COMMENTS'],knowledge_context:{x:'PRIVATE-CONTEXT'}}]}));
 execFileSync(process.execPath,[path.join(root,'scripts/build_work_system_qa_public.cjs'),input,out]);
 const index=fs.readFileSync(path.join(out,'work-system-qa-public.json'),'utf8');assert(!index.includes('PRIVATE-'));
 const parsed=JSON.parse(index);assert.equal(parsed.meta.public_only,true);assert.equal(parsed.articles.length,1);assert(!parsed.articles[0].text,'index must not duplicate article bodies');
 for(const file of fs.readdirSync(path.join(out,'work-system-qa-public'))){const text=fs.readFileSync(path.join(out,'work-system-qa-public',file),'utf8');assert(!text.includes('PRIVATE-'));assert.equal(JSON.parse(text).meta.generation,parsed.meta.generation);}
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('Public QA core passed: public-only fields, source URL restrictions, local collection matching, multilingual ranking, request allowlist, bounded follow-up and citation validation.');
