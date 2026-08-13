(() => {
  const BASE_QUERY_SCORE_V6 = queryScore;
  const BASE_RAW_RESULTS_V6 = rawResults;
  const BASE_RENDER_HINT_V6 = renderIntentHint;
  const MODEL_DOWNLOAD_NOTE = '首次约140MB，之后浏览器缓存';
  const queryCache = new Map();
  const pending = new Map();
  let semanticIndex = null;
  let packedVectors = null;
  let worker = null;
  let requestSeq = 0;
  let debounceTimer = null;
  let state = {query:'', status:'idle', error:'', maps:{rule:new Map(),private:new Map(),notion:new Map()}};

  function decodeInt8Base64(s){
    const bin=atob(s||''),u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    return new Int8Array(u8.buffer);
  }

  async function ensureIndex(){
    if(semanticIndex)return semanticIndex;
    state.status='index-loading';
    const data=await loadEncryptedData('data/semantic-index.json','data/semantic-index.enc.json',{prompt:false});
    if(!data||data.locked||!data.entries||!data.vectors_b64)throw new Error(data?.decryption_error||'语义索引尚未生成');
    semanticIndex=data;
    packedVectors=decodeInt8Base64(data.vectors_b64);
    return data;
  }

  function ensureWorker(){
    if(worker)return worker;
    worker=new Worker('semantic-worker.bundle.js',{type:'module'});
    worker.onmessage=(event)=>{
      const m=event.data||{};
      if(m.type==='status'){
        if(m.status==='loading')state.status='model-loading';
        if(m.status==='ready')state.status='ready';
        renderRules();
        return;
      }
      const p=pending.get(m.id);
      if(!p)return;
      if(m.type==='embedding'){
        pending.delete(m.id);p.resolve(m.vector instanceof Float32Array?m.vector:Float32Array.from(m.vector||[]));
      }else if(m.type==='error'){
        pending.delete(m.id);p.reject(new Error(m.error||'embedding failed'));
      }
    };
    worker.onerror=(e)=>{
      state.status='error';state.error=String(e?.message||'Web Worker error');
      for(const [,p] of pending)p.reject(new Error(state.error));
      pending.clear();
      renderRules();
    };
    return worker;
  }

  function embedQuery(text){
    const key=normalize(text);
    if(queryCache.has(key))return Promise.resolve(queryCache.get(key));
    const w=ensureWorker(),id=++requestSeq;
    state.status='model-loading';
    return new Promise((resolve,reject)=>{
      pending.set(id,{resolve:(v)=>{queryCache.set(key,v);resolve(v);},reject});
      w.postMessage({type:'embed',id,text});
    });
  }

  function topGrouped(rows,kind,limit=20){
    const best=new Map();
    for(const r of rows){
      if(r.kind!==kind)continue;
      const old=best.get(r.id);
      if(!old||r.sim>old.sim)best.set(r.id,r);
    }
    const arr=[...best.values()].sort((a,b)=>b.sim-a.sim);
    if(!arr.length)return new Map();
    const top=arr[0].sim,cutoff=Math.max(0.64,top-0.085);
    const out=new Map();
    arr.filter(x=>x.sim>=cutoff).slice(0,limit).forEach((x,rank)=>out.set(x.id,{...x,rank:rank+1,cutoff}));
    return out;
  }

  function scoreIndex(queryVector){
    const idx=semanticIndex,dim=Number(idx?.meta?.dimension||0),entries=idx?.entries||[],scales=idx?.scales||[];
    if(!dim||queryVector.length!==dim||packedVectors.length<entries.length*dim)throw new Error('语义索引维度不一致');
    const rows=[];
    for(let i=0;i<entries.length;i++){
      const off=i*dim,scale=Number(scales[i]||0);let dot=0;
      for(let j=0;j<dim;j++)dot+=queryVector[j]*packedVectors[off+j]*scale;
      rows.push({...entries[i],sim:dot});
    }
    return {
      rule:topGrouped(rows,'rule',18),
      private:topGrouped(rows,'private',24),
      notion:topGrouped(rows,'notion',24),
    };
  }

  async function runSemantic(q){
    const raw=normalize(q);
    if(raw.length<2)return;
    state={query:raw,status:'index-loading',error:'',maps:state.maps};renderRules();
    try{
      await ensureIndex();
      const vector=await embedQuery(q);
      if(normalize($w('playbookSearch')?.value||'')!==raw)return;
      state={query:raw,status:'ready',error:'',maps:scoreIndex(vector)};
      renderRules();
    }catch(e){
      if(normalize($w('playbookSearch')?.value||'')!==raw)return;
      state={query:raw,status:'error',error:String(e?.message||e),maps:{rule:new Map(),private:new Map(),notion:new Map()}};
      console.warn('Local semantic search unavailable:',e);
      renderRules();
    }
  }

  function vectorBoost(hit){
    if(!hit)return 0;
    return Math.max(5.5,14-(hit.rank-1)*0.65);
  }

  queryScore=function(r,ctx){
    const base=BASE_QUERY_SCORE_V6(r,ctx)||0;
    if(!ctx?.raw||state.status!=='ready'||state.query!==ctx.raw)return base;
    const hit=state.maps.rule.get(String(r.id||''));
    return hit?Math.max(base,vectorBoost(hit))+Math.min(3,base*.12):base;
  };

  rawResults=function(ctx,excluded=new Set(),limit=10){
    const base=BASE_RAW_RESULTS_V6(ctx,excluded,Math.max(limit,16));
    if(!ctx?.raw||state.status!=='ready'||state.query!==ctx.raw)return base;
    const byKey=new Map(base.map(x=>[`${x.kind}:${x.id}`,x]));
    const nm=noteMap(),km=knowledgeMap();

    function merge(kind,hitMap){
      for(const [id,hit] of hitMap){
        const excludeKey=(kind==='private'?'n:':'k:')+id;
        if(excluded.has(excludeKey))continue;
        const key=`${kind}:${id}`,existing=byKey.get(key);
        if(existing){
          existing.vectorHit=hit;
          existing.score=Math.max(existing.score||0,vectorBoost(hit));
          if(!['core','support'].includes(existing.semantic?.level))existing.semantic={...(existing.semantic||{}),level:'vector'};
          continue;
        }
        if(kind==='private'){
          const n=nm.get(id);if(!n)continue;
          byKey.set(key,{kind,id,score:vectorBoost(hit),title:n.title||n.section||'工作笔记',subtitle:`${n.source_label||'私人资料'} · ${n.section||''}`,text:n.text||'',note:n,semantic:{level:'vector',facets:[]},vectorHit:hit});
        }else{
          const a=km.get(id);if(!a)continue;
          byKey.set(key,{kind:'notion',id,score:vectorBoost(hit),title:a.title||'Notion Knowledge',subtitle:`Notion · ${a.category||'未分类'}`,text:a.summary||a.page_body||'',article:a,semantic:{level:'vector',facets:[]},vectorHit:hit});
        }
      }
    }
    merge('private',state.maps.private);merge('notion',state.maps.notion);
    const rank={core:5,support:4,vector:3,direct:2,none:0};
    const rows=[...byKey.values()].sort((a,b)=>(rank[b.semantic?.level]||0)-(rank[a.semantic?.level]||0)||(a.vectorHit?.rank||99)-(b.vectorHit?.rank||99)||b.score-a.score);
    return rows.slice(0,Math.max(limit,10));
  };

  function vectorRelation(x){
    const h=x.vectorHit;
    if(!h)return'';
    return `<small>多语言向量召回 · 语义排名 #${h.rank}</small>`;
  }

  renderRaw=function(rows){
    if(!rows.length)return'';
    const ctx=makeQueryContext($w('playbookSearch')?.value||'');
    return `<section class="raw-recall"><div class="section-head slim"><div><h2>相关原始知识</h2><p class="muted small">核心场景 + 跨领域支撑 + 本地多语言向量召回。向量按文章分段计算，因此长文章中后段的相关内容也能被找到。</p></div></div><div class="raw-recall-list">${rows.map(x=>{
      const s=x.semantic||{},v=vectorRelation(x);let rel='';
      if(s.level==='core')rel=`<span class="raw-kind">核心相关</span>${s.facets?.length?`<small>内容依据：${ew(s.facets.join(' / '))}</small>`:''}${v}`;
      else if(s.level==='support')rel=`<span class="raw-kind">支撑相关</span><small>为什么有用：${ew((s.facets||[]).join(' / '))}</small>${v}`;
      else if(s.level==='vector')rel=`<span class="raw-kind">语义相关</span>${v}`;
      else rel=`<span class="raw-kind">直接命中</span>${v}`;
      const shown=x.vectorHit?.snippet||excerpt(x.text,ctx,300);
      if(x.kind==='notion')return `<a class="raw-recall-item" href="knowledge.html?open=${encodeURIComponent(x.id||'')}"><div>${rel}<b>${ew(x.title)}</b><small>${ew(x.subtitle)}</small></div><p>${ew(shown)}</p></a>`;
      const url=sourceUrl(x.note);return `<div class="raw-recall-item"><div>${rel}<b>${ew(x.title)}</b><small>${ew(x.subtitle)}</small></div><p>${ew(shown)}</p>${url?`<a class="raw-source-link" href="${ew(url)}" target="_blank" rel="noopener noreferrer">打开原资料 ↗</a>`:''}</div>`;
    }).join('')}</div></section>`;
  };

  renderIntentHint=function(ctx,ruleCount,rawCount){
    BASE_RENDER_HINT_V6(ctx,ruleCount,rawCount);
    const box=$w('queryIntentHint');if(!box||box.classList.contains('hidden')||!ctx?.raw)return;
    const old=box.querySelector('.semantic-vector-status');if(old)old.remove();
    const note=document.createElement('small');note.className='semantic-vector-status';
    if(state.query!==ctx.raw||state.status==='idle')note.textContent='本地语义向量准备中…';
    else if(state.status==='index-loading')note.textContent='正在读取加密语义索引…';
    else if(state.status==='model-loading')note.textContent=`正在本机加载多语言语义模型（${MODEL_DOWNLOAD_NOTE}）`;
    else if(state.status==='ready')note.textContent='本地多语言 Embedding 已参与排序；查询文本不上传';
    else if(state.status==='error')note.textContent='本地语义暂不可用，已自动回退到概念检索';
    box.appendChild(note);
  };

  function schedule(){
    clearTimeout(debounceTimer);
    const q=($w('playbookSearch')?.value||'').trim();
    if(normalize(q).length<2){state={query:'',status:'idle',error:'',maps:{rule:new Map(),private:new Map(),notion:new Map()}};return;}
    if(state.query===normalize(q)&&state.status==='ready')return;
    debounceTimer=setTimeout(()=>runSemantic(q),650);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $w('playbookSearch')?.addEventListener('input',schedule);
  });
})();
