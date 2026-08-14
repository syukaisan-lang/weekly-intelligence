import fs from 'node:fs';

const input=JSON.parse(fs.readFileSync(0,'utf8'));
const pending=new Map();
let seq=0;
globalThis.self={
  postMessage(message){
    if(message?.type==='embedding'){
      const p=pending.get(message.id);if(p){pending.delete(message.id);p.resolve(Array.from(message.vector||[]));}
    }else if(message?.type==='error'){
      const p=pending.get(message.id);if(p){pending.delete(message.id);p.reject(new Error(message.error||'embedding failed'));}
    }
  },
  onmessage:null
};
await import(new URL('../semantic-worker.bundle.js',import.meta.url));

function embed(text){
  const id=`w${++seq}`;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    self.onmessage({data:{type:'embed',id,text}});
  });
}
function decodeInt8(b64){
  const b=Buffer.from(b64,'base64'),out=new Int8Array(b.length);
  for(let i=0;i<b.length;i++)out[i]=b[i]>127?b[i]-256:b[i];
  return out;
}
function normalize(v){
  let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n)||1;return v.map(x=>x/n);
}
function quantize(v){
  let max=0;for(const x of v)max=Math.max(max,Math.abs(x));
  const scale=Math.max(max/127,1e-8),buf=Buffer.alloc(v.length);
  for(let i=0;i<v.length;i++){
    let q=Math.max(-127,Math.min(127,Math.round(v[i]/scale)));if(q<0)q+=256;buf[i]=q;
  }
  return {q:buf.toString('base64'),scale};
}
function dotQuant(query,q,start,dim,scale){
  let s=0;for(let i=0;i<dim;i++)s+=query[i]*q[start+i]*scale;return s;
}
function aggregate(scores,entries,kind){
  const best=new Map();
  for(let i=0;i<scores.length;i++){
    if(entries[i]?.kind!==kind)continue;
    const id=String(entries[i]?.id||''),v=scores[i];
    if(!best.has(id)||v>best.get(id))best.set(id,v);
  }
  const vals=[...best.values()].sort((a,b)=>b-a).slice(0,3);
  return {max:vals[0]||0,mean:vals.length?vals.reduce((s,x)=>s+x,0)/vals.length:0};
}

const index=input.index||{},entries=index.entries||[],dim=Number(index.dim||0);
const qIndex=decodeInt8(index.vectors_b64||''),scales=index.scales||[];
if(!dim||qIndex.length!==entries.length*dim||scales.length!==entries.length)throw new Error('invalid semantic index payload');
const results={};
for(const article of input.articles||[]){
  const chunkVectors=[];
  for(const text of article.chunks||[])chunkVectors.push(await embed(text));
  if(!chunkVectors.length)continue;
  const scores=new Float32Array(entries.length);scores.fill(-1);
  for(const v of chunkVectors){
    for(let j=0;j<entries.length;j++){
      const s=dotQuant(v,qIndex,j*dim,dim,Number(scales[j]||0));if(s>scores[j])scores[j]=s;
    }
  }
  const doc=new Array(dim).fill(0);
  for(const v of chunkVectors)for(let i=0;i<dim;i++)doc[i]+=v[i]/chunkVectors.length;
  const normalized=normalize(doc),packed=quantize(normalized);
  const rule=aggregate(scores,entries,'rule'),knowledge=aggregate(scores,entries,'notion'),experience=aggregate(scores,entries,'private');
  results[String(article.id)]={
    vector:{version:1,family:'multilingual-e5',dim,q:packed.q,scale:packed.scale,normalized:true},
    rule_similarity:rule.max,knowledge_similarity:knowledge.max,experience_similarity:experience.max,
    rule_top3_mean:rule.mean,knowledge_top3_mean:knowledge.mean,experience_top3_mean:experience.mean
  };
}
process.stdout.write(JSON.stringify({results}));
