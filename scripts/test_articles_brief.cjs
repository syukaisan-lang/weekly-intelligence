const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),original=path.join(root,'data/articles.json');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'weekly-brief-test-'));
try{
  const file=path.join(temp,'articles-brief.json');
  execFileSync(process.execPath,[path.join(__dirname,'build_articles_brief.cjs'),original,file]);
  const full=JSON.parse(fs.readFileSync(original,'utf8'));
  const brief=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(brief.articles.length,full.articles.length);
  const cutoff=Date.now()-7*86400000;
  let recent=0,history=0;
  for(let i=0;i<full.articles.length;i++){
    const originalRow=full.articles[i],row=brief.articles[i];
    assert.equal(row.id,originalRow.id);
    if(Date.parse(originalRow.first_seen||originalRow.published||'')>=cutoff){
      recent++;assert.equal(row.content_excerpt,originalRow.content_excerpt);
    }else{
      history++;assert(!row.content_excerpt);
      assert.deepEqual(row.semantic_vector,originalRow.semantic_vector);
      assert.equal(row.url,originalRow.url);
    }
  }
  assert(recent>0&&history>0);
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const filters=app.slice(app.indexOf('function activeReaderArticle'),app.indexOf('let fullArticlesLoaded'));
  const vm=require('node:vm'),context={};vm.createContext(context);vm.runInContext(filters,context);
  const retired={id:'retired',source:'日経クロストレンド 新着',url:'https://xtrend.nikkei.com/atcl/example',first_seen:new Date().toISOString()};
  assert.equal(context.activeReaderArticle(retired),false);
  assert.equal(context.activeReaderArticle({...retired,source:'legacy name'}),false);
  assert.equal(context.activeReaderArticle({source:'MarkeZine:新着一覧',url:'https://markezine.jp/article'}),true);
  const coverage=context.activeCoverage({sources:[{name:retired.source,status:'failed'},{name:'MarkeZine:新着一覧',status:'ok'}],failed_sources:[{name:retired.source}],expected_sources:16});
  assert.equal(coverage.expected_sources,15);assert.equal(coverage.successful_sources,1);assert.equal(coverage.failed_sources.length,0);
  const fixture=path.join(temp,'retired.json');fs.writeFileSync(fixture,JSON.stringify({articles:[retired]}));
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'free_review_candidates.cjs'),fixture],{encoding:'utf8'})),[]);

  assert(fs.statSync(file).size<fs.statSync(original).size*.8);
  console.log(`Brief payload preserves ${recent} recent articles and ${history} historical feedback vectors.`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
