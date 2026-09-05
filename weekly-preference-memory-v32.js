// Weekly v32: unified long-term Preference Memory built from article content + historical behavior.
// Keeps learning sparse/lightweight in the browser: article semantics are already computed server-side;
// this layer learns durable topic × format × intent × evidence combinations from the user's own history.
(() => {
  const KEY='weekly_intelligence_preference_memory_v32';
  const DAY=86400000, MAX_AGE=365;
  const NEGATIVE=new Set(['bad','less']);
  const GENERIC=new Set(['AI','生成AI','EC','eコマース','市場','調査','データ','広告','ブランド','消費者','顧客','ユーザー','マーケティング','コンテンツ']);
  let memoryCache=null, scoreCache=new Map(), revision=0, rebuilding=false;

  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function allRows(){return window.weeklyUiFixesV25?.allRows?.()||(Array.isArray(data?.articles)?data.articles:[]);}
  function uniq(xs){return [...new Set((xs||[]).map(x=>String(x||'').trim()).filter(Boolean))];}
  function ageWeight(ts){
    if(!ts)return .62;
    const age=Math.max(0,(Date.now()-Number(ts||0))/DAY);
    if(age<=30)return 1;
    if(age<=90)return .90;
    if(age<=180)return .76;
    if(age<=MAX_AGE)return .58;
    return 0;
  }
  function laterHistory(s){return s?.status==='later'||s?.feedback_reason==='later_interest'||Number(s?.later_interest_at||0)>0;}
  function stateTs(a,s){return Number(s?.later_interest_at||s?.feedback_reason_updated_at||s?.status_updated_at||s?.updated_at||0)||Date.parse(a?.first_seen||a?.published||'')||0;}

  function contentFeatures(a){
    let f={topics:[],formats:[],intents:[],signals:[]};
    try{f=typedFeatures(a)||f;}catch(_){}
    const topics=uniq([...(f.topics||[]),...(a?.concepts||[])]).filter(x=>!GENERIC.has(x)).slice(0,7);
    const formats=uniq(f.formats||[]).slice(0,4);
    const intents=uniq(f.intents||[]).slice(0,4);
    const signals=uniq(f.signals||[]).slice(0,4);
    const inc=String(a?.knowledge_context?.increment_type||a?.increment_type||'').trim();
    const out=[];
    topics.forEach(x=>out.push('topic:'+x));
    formats.forEach(x=>out.push('format:'+x));
    intents.forEach(x=>out.push('intent:'+x));
    signals.forEach(x=>out.push('signal:'+x));
    if(inc)out.push('increment:'+inc);
    // Combination features are the core of the deeper learner: dislike AI webinar != dislike AI.
    for(const t of topics.slice(0,4)){
      for(const f1 of formats.slice(0,2))out.push(`combo:${t} × ${f1}`);
      for(const i of intents.slice(0,2))out.push(`combo:${t} × ${i}`);
      for(const s of signals.slice(0,1))out.push(`combo:${t} × ${s}`);
    }
    for(const f1 of formats.slice(0,2))for(const i of intents.slice(0,2))out.push(`combo:${f1} × ${i}`);
    return uniq(out).slice(0,28);
  }
  function featureKind(k){return k.split(':',1)[0];}
  function entry(map,k){if(!map[k])map[k]={pos:0,neg:0,pos_n:0,neg_n:0,last_pos:0,last_neg:0};return map[k];}
  function apply(map,keys,value,ts){
    if(!value)return;
    const w=ageWeight(ts);if(!w)return;
    for(const k of keys){const e=entry(map,k),v=Math.abs(value)*w;if(value>0){e.pos+=v;e.pos_n++;e.last_pos=Math.max(e.last_pos,ts);}else{e.neg+=v;e.neg_n++;e.last_neg=Math.max(e.last_neg,ts);}}
  }
  function keysByReason(keys,reason){
    if(reason==='topic'||reason==='not_work')return keys.filter(k=>k.startsWith('topic:')||k.startsWith('combo:'));
    if(reason==='promo')return keys.filter(k=>/^(format|intent|signal|combo):/.test(k));
    if(reason==='too_generic'||reason==='no_evidence'||reason==='known')return keys.filter(k=>/^(signal|increment|combo):/.test(k));
    return keys;
  }
  function buildMemory(){
    const entries={};let samples=0,posSamples=0,negSamples=0;
    for(const a of allRows()){
      const s=hs(a),keys=contentFeatures(a);if(!keys.length)continue;
      const ts=stateTs(a,s);let touched=false;
      if(laterHistory(s)){
        apply(entries,keys,3.15,Number(s.later_interest_at||0)||ts);posSamples++;touched=true;
      }
      if(s.status==='save'){
        apply(entries,keys,.65,Number(s.status_updated_at||0)||ts);posSamples++;touched=true;
      }
      if(s.feedback==='more'||s.feedback==='accurate'){
        apply(entries,keys,s.feedback==='more'?1.25:.58,Number(s.feedback_reason_updated_at||0)||ts);posSamples++;touched=true;
      }
      if(NEGATIVE.has(s.feedback)){
        const r=s.feedback_reason||'';
        const base={topic:3.25,promo:3.0,not_work:2.65,too_generic:1.75,no_evidence:1.9,known:1.35}[r]||(s.feedback==='less'?1.45:.8);
        apply(entries,keysByReason(keys,r),-(s.feedback==='less'?base:base*.72),Number(s.feedback_reason_updated_at||0)||ts);negSamples++;touched=true;
      }else if(s.status==='skip'){
        // Explicit skip is useful but deliberately weak. Mere non-click/unread is never negative.
        apply(entries,keys,-.42,Number(s.status_updated_at||0)||ts);negSamples++;touched=true;
      }
      if(touched)samples++;
    }
    const clean={};
    for(const [k,e] of Object.entries(entries)){
      e.pos=Number(e.pos.toFixed(3));e.neg=Number(e.neg.toFixed(3));
      if(e.pos+e.neg>=.16)clean[k]=e;
    }
    const m={version:32,updated_at:new Date().toISOString(),sample_count:samples,positive_samples:posSamples,negative_samples:negSamples,entries:clean};
    memoryCache=m;
    try{localStorage.setItem(KEY,JSON.stringify(m));}catch(_){}
    return m;
  }
  function memory(){
    if(memoryCache)return memoryCache;
    // Rebuild from raw historical state whenever articles/state are available; persisted JSON is only a durable cache.
    if(allRows().length)return buildMemory();
    try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x?.version===32)return (memoryCache=x);}catch(_){}
    return {version:32,entries:{},sample_count:0,positive_samples:0,negative_samples:0};
  }
  function net(e){
    if(!e)return 0;
    // Newer opposite behavior can reopen a preference instead of freezing it forever.
    if(e.last_pos>e.last_neg)return e.pos-1.10*e.neg;
    if(e.last_neg>e.last_pos)return .75*e.pos-e.neg;
    return e.pos-e.neg;
  }
  function explain(a){
    const m=memory(),parts=[];
    for(const k of contentFeatures(a)){
      const e=m.entries[k];if(!e)continue;const n=net(e);if(Math.abs(n)<.35)continue;
      const kind=featureKind(k),scale=kind==='combo'?1.0:kind==='topic'?.72:kind==='increment'?.58:.66;
      const c=Math.tanh(n/2.8)*scale;parts.push({key:k,net:n,contribution:c,pos:e.pos,neg:e.neg});
    }
    parts.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));
    const picked=parts.slice(0,7),delta=Math.max(-1.85,Math.min(1.65,picked.reduce((n,x)=>n+x.contribution,0)));
    const strongNeg=picked.filter(x=>x.net<=-2.15);
    let cap=10;if(strongNeg.some(x=>x.key.startsWith('combo:'))||strongNeg.length>=2)cap=6.9;if(strongNeg.some(x=>x.net<=-4.2))cap=5.4;
    return {delta,cap,parts:picked};
  }

  const previousScore=typeof score==='function'?score:null;
  if(previousScore){
    score=function(a){
      const key=String(a?.id||a?.url||a?.title||''),hit=key?scoreCache.get(key):null;
      if(hit&&hit.rev===revision)return hit.value;
      const base=Number(previousScore(a))||Number(a?.reading_score??5)||5;
      const e=explain(a),value=Math.max(0,Math.min(10,Math.min(base+e.delta,e.cap)));
      if(key)scoreCache.set(key,{rev:revision,value});return value;
    };
  }

  function invalidate(){revision++;scoreCache.clear();memoryCache=null;try{window.weeklyReadingTimeV21?.invalidate?.();}catch(_){};try{window.weeklyPerformanceV28?.invalidate?.();}catch(_){};}
  if(typeof save==='function'){
    const prev=save;save=function(){invalidate();const out=prev();setTimeout(()=>{if(!rebuilding){rebuilding=true;try{buildMemory();}finally{rebuilding=false;}}},0);return out;};
  }
  document.getElementById('resetLearning')?.addEventListener('click',()=>{try{localStorage.removeItem(KEY);}catch(_){}invalidate();},{capture:true});

  function labelKey(k){return k.replace(/^topic:/,'').replace(/^format:/,'').replace(/^intent:/,'').replace(/^signal:/,'').replace(/^increment:/,'').replace(/^combo:/,'');}
  function memorySummary(){
    const m=memory(),rows=Object.entries(m.entries).map(([k,e])=>({k,e,n:net(e)})).filter(x=>Math.abs(x.n)>=.75).sort((a,b)=>Math.abs(b.n)-Math.abs(a.n));
    return {positive:rows.filter(x=>x.n>0).slice(0,5),negative:rows.filter(x=>x.n<0).slice(0,5),samples:m.sample_count||0};
  }
  if(typeof renderPrefs==='function'){
    const prev=renderPrefs;renderPrefs=function(){
      prev();const root=document.getElementById('learnedPrefs');if(!root)return;
      root.querySelector('.preference-memory-v32')?.remove();
      const s=memorySummary(),box=document.createElement('div');box.className='muted small precision-learning-note preference-memory-v32';
      const pos=s.positive.map(x=>labelKey(x.k)).join(' / '),neg=s.negative.map(x=>labelKey(x.k)).join(' / ');
      box.innerHTML=`<b>长期 Preference Memory</b>：${s.samples} 个历史行为样本。${pos?`<br>偏好：${esc(pos)}`:''}${neg?`<br>降权：${esc(neg)}`:''}<br>学习单位是“主题 × 形式 × 意图 × 证据/知识增量”的组合；稍后看权重最高，未点击不算负反馈。`;
      root.appendChild(box);
    };
  }

  // Build once after every layer before us has installed its own score guards.
  invalidate();buildMemory();
  try{renderPrefs?.();}catch(_){}
  try{renderArticles?.();}catch(_){}
  window.weeklyPreferenceMemoryV32={memory,buildMemory,invalidate,explain,contentFeatures,memorySummary};
})();
