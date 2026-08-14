(() => {
  const baseScore=score;
  const baseRebuildPrefs=rebuildPrefs;
  const baseRenderPrefs=renderPrefs;
  const cache=new Map();
  let samples=[];

  function vectorOf(a){
    const id=String(a?.id||'');
    if(cache.has(id))return cache.get(id);
    const e=a?.semantic_vector;
    if(!e?.q||!Number(e.dim)||!Number(e.scale)){cache.set(id,null);return null;}
    try{
      const raw=atob(e.q),v=new Float32Array(Number(e.dim));
      if(raw.length!==v.length){cache.set(id,null);return null;}
      let norm=0;
      for(let i=0;i<v.length;i++){let n=raw.charCodeAt(i);if(n>127)n-=256;v[i]=n*Number(e.scale);norm+=v[i]*v[i];}
      norm=Math.sqrt(norm)||1;for(let i=0;i<v.length;i++)v[i]/=norm;
      cache.set(id,v);return v;
    }catch(_){cache.set(id,null);return null;}
  }
  function dot(a,b){let s=0;for(let i=0;i<Math.min(a.length,b.length);i++)s+=a[i]*b[i];return s;}
  function weight(a,fb){
    const contextHeavy=isContextDominant(typedFeatures(a));
    if(fb==='more')return .62;
    if(fb==='accurate')return .18;
    if(fb==='bad')return contextHeavy?-.13:-.38;
    if(fb==='less')return contextHeavy?-.22:-.72;
    return 0;
  }
  function rebuildSemantic(){
    samples=[];
    for(const a of data.articles||[]){
      const fb=st(a.id).feedback,v=fb?vectorOf(a):null,w=fb?weight(a,fb):0;
      if(v&&w)samples.push({id:String(a.id),v,w});
    }
  }
  function semanticDelta(a){
    const v=vectorOf(a);if(!v||!samples.length)return 0;
    const pos=[],neg=[];
    for(const s of samples){
      if(s.id===String(a.id))continue;
      const sim=dot(v,s.v);if(sim<.80)continue;
      const affinity=Math.min(1,Math.max(0,(sim-.80)/.17));
      const c=s.w*affinity;(c>=0?pos:neg).push(c);
    }
    pos.sort((x,y)=>y-x);neg.sort((x,y)=>x-y);
    const delta=pos.slice(0,3).reduce((s,x)=>s+x,0)+neg.slice(0,3).reduce((s,x)=>s+x,0);
    return Math.max(-.95,Math.min(.72,delta));
  }

  rebuildPrefs=function(){baseRebuildPrefs();rebuildSemantic();};
  score=function(a){return Math.max(0,Math.min(10,baseScore(a)+semanticDelta(a)));};
  renderPrefs=function(){
    baseRenderPrefs();
    const root=document.getElementById('learnedPrefs');if(!root)return;
    const positive=samples.filter(x=>x.w>0).length,negative=samples.filter(x=>x.w<0).length;
    if(!positive&&!negative)return;
    const row=document.createElement('div');row.className='pref-row semantic-pref-row';
    row.innerHTML=`<span>语义学习：内容含义</span><span class="weight">+${positive} / -${negative}</span>`;
    root.prepend(row);
    const note=document.createElement('div');note.className='muted small semantic-pref-note';
    note.textContent='向量只影响真正语义接近的文章；活动告知、PR等负反馈仍主要由形式和意图承担。';
    root.appendChild(note);
  };
  const baseRenderArticles=renderArticles;
  renderArticles=function(){
    baseRenderArticles();
    document.querySelectorAll('.feedback-label').forEach(x=>x.textContent='筛选反馈（学习内容含义 + 主题 / 形式 / 意图）');
  };
})();
