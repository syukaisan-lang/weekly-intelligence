// Build a compact search index and small public-evidence shards. Private inputs are never read.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Q=require('../work-system-qa-core.js');
const root=path.join(__dirname,'..'),input=process.argv[2]||path.join(root,'data/articles.json'),out=process.argv[3]||path.join(root,'data');
const raw=JSON.parse(fs.readFileSync(input,'utf8')),rows=(raw.articles||[]).map(Q.publicArticle).filter(Boolean);
const stop=new Set(['する','こと','ため','など','から','ある','ない','という','として','できる','それ','その','この','もの','よう','ので','いる','また','について','による','によって','した','される','ます','です']);
const segmenter=new Intl.Segmenter('ja',{granularity:'word'}),docs=[],df=new Map();
for(const row of rows){
 const counts=new Map();for(const token of segmenter.segment([row.title,row.summary,row.text].join(' '))){const word=token.segment.toLowerCase();if(token.isWordLike&&word.length>=2&&word.length<=30&&!stop.has(word))counts.set(word,(counts.get(word)||0)+1);}
 docs.push(counts);for(const word of counts.keys())df.set(word,(df.get(word)||0)+1);
}
const shards=Array.from({length:16},()=>({})),index=[];
for(let i=0;i<rows.length;i++){
 const row=rows[i],bucket=crypto.createHash('sha256').update(row.id).digest('hex')[0];
 shards[parseInt(bucket,16)][row.id]=row;
 const terms=[...docs[i]].map(([word,n])=>({word,weight:Math.log(1+n)*Math.log(1+rows.length/(df.get(word)||1))})).sort((a,b)=>b.weight-a.weight).slice(0,45).map(x=>x.word);
 index.push({id:row.id,url:row.url,title:row.title,source:row.source,published:row.published,summary:row.summary.slice(0,260),evidence_chars:(row.text||row.summary).length,search_terms:terms,shard:bucket});
}
const generation=crypto.createHash('sha256').update(JSON.stringify({schema:2,rows,index})).digest('hex').slice(0,20);
const meta={schema_version:1,public_only:true,generated_at:raw.meta?.generated_at||'',generation,article_count:rows.length};
const target=path.join(out,'work-system-qa-public');fs.mkdirSync(target,{recursive:true});
for(let i=0;i<16;i++)fs.writeFileSync(path.join(target,i.toString(16)+'.json'),JSON.stringify({meta,articles:shards[i]}));
fs.writeFileSync(path.join(out,'work-system-qa-public.json'),JSON.stringify({meta,articles:index}));
console.log(`Built public QA index: ${rows.length} articles, ${fs.statSync(path.join(out,'work-system-qa-public.json')).size} bytes, 16 evidence shards; only public article fields.`);
