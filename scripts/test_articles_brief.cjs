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
  assert(fs.statSync(file).size<fs.statSync(original).size*.8);
  console.log(`Brief payload preserves ${recent} recent articles and ${history} historical feedback vectors.`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
