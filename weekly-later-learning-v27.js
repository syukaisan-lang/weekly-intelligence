// Weekly v27.2: Later is the strongest positive recommendation signal.
// Explicit positive feedback is treated mainly as a correction signal; explicit negative feedback/skip can override Later.
// Performance: cache article features, keep Later samples across normal renders, and avoid a second render on status changes.
(() => {
  const MARKER='later_interest';
  const DIRTY_KEY='weekly_intelligence_dirty_since_v1';
  const DAY=86400000;
  const MAX_AGE=180;
  let sampleCache=null;
  const featureCache=new Map();
  const deltaCache=new Map();

  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function uniq(xs){return [...new Set((xs||[]).filter(Boolean))];}
  function overlap(a,b){if(!a.length||!b.length)return 0;const bs=new Set(b);return a.filter(x=>bs.has(x)).length/Math.max(a.length,b.length);}
  function ageWeight(ts){
    const age=Math.max(0,(Date.now()-Number(ts||0))/DAY);
    if(age<=30)return 1;
    if(age<=90)return .82;
    if(age<=MAX_AGE)return .60;
    return 0;
  }
  function features(a){
    const key=String(a?.id||a?.url||'');
    if(key&&featureCache.has(key))return featureCache.get(key);
    const fp=window.weeklyLearningPrecisionV15?.fingerprint?.(a)||{subjects:[],formats:[],intents:[],signals:[],raw:''};
    let topics=[];
    try{topics=typeof typedFeatures==='function'?(typedFeatures(a).topics||[]):[];}catch(_){}
    const out={subjects:uniq(fp.subjects),topics:uniq(topics),formats:uniq(fp.formats),intents:uniq(fp.intents),signals:uniq(fp.signals),raw:fp.raw||''};
    if(key)featureCache.set(key,out);
    return out;
  }
  function isHeavy(fp){return /オンラインセミナー|ウェビナー|セミナー|イベント|カンファレンス|参加募集|申込|新製品|新商品|発売|キャンペーン|プレゼント|セール/i.test(fp.raw||'');}
  function sampleTs(a,s){return Number(s.later_interest_at||s.feedback_reason_updated_at||s.status_updated_at||s.updated_at||0)||Date.parse(a?.first_seen||a?.published||'')||0;}
  function hasLaterHistory(s){return s?.status==='later'||s?.feedback_reason===MARKER||Number(s?.later_interest_at||0)>0;}
  function isNegative(s){return ['bad','less'].includes(s?.feedback)||s?.status==='skip';}
  function invalidate(){sampleCache=null;deltaCache.clear();}

  function buildSamples(){
    const rows=[];
    for(const a of data?.articles||[]){
      const s=hs(a);
      if(isNegative(s)||!hasLaterHistory(s))continue;
      const ts=sampleTs(a,s),w=ageWeight(ts);if(!w)continue;
      const fp=features(a);if(!fp.subjects.length&&!fp.topics.length)continue;
      rows.push({id:String(a.id),fp,w,ts});
    }
    sampleCache=rows;return rows;
  }
  function samples(){return sampleCache||buildSamples();}
  function similarity(target,source){
    const subj=overlap(target.subjects,source.subjects),topic=overlap(target.topics,source.topics);
    const core=Math.max(subj,topic*.86);if(!core)return 0;
    const ctx=Math.max(overlap(target.formats,source.formats),overlap(target.intents,source.intents));
    const sig=overlap(target.signals,source.signals);
    let v=.18+.34*core+.075*ctx+.055*sig;
    if(isHeavy(source)&&!isHeavy(target)&&ctx===0)v*=.35;
    return v;
  }
  function laterDelta(a){
    const key=String(a?.id||a?.url||'');
    if(key&&deltaCache.has(key))return deltaCache.get(key);
    const target=features(a),vals=[];
    for(const s of samples()){
      if(s.id===String(a.id))continue;
      const sim=similarity(target,s.fp);if(sim>0)vals.push(sim*s.w);
    }
    vals.sort((a,b)=>b-a);
    const out=Math.max(0,Math.min(1.15,vals.slice(0,4).reduce((n,x)=>n+x,0)));
    if(key)deltaCache.set(key,out);
    return out;
  }
  function markLaterInterest(a,cur,when=Date.now()){
    if(!cur||isNegative(cur))return false;
    cur.later_interest_at=Math.max(Number(cur.later_interest_at||0),when);
    if(!cur.feedback_reason)cur.feedback_reason=MARKER;
    if(cur.feedback_reason===MARKER)cur.feedback_reason_updated_at=when;
    cur.updated_at=Math.max(Number(cur.updated_at||0),when);
    state[a.id]=cur;
    try{save();}catch(_){}
    if(!localStorage.getItem(DIRTY_KEY))localStorage.setItem(DIRTY_KEY,String(when));
    return true;
  }
  function migrateCurrentLater(){
    let changed=0;
    for(const a of data?.articles||[]){
      const s=hs(a);if(s.status!=='later'||isNegative(s)||Number(s.later_interest_at||0)>0)continue;
      const ts=Number(s.status_updated_at||s.updated_at||0)||Date.now();
      if(markLaterInterest(a,s,ts))changed++;
    }
    if(changed)invalidate();
    return changed;
  }

  if(typeof score==='function'){
    const previousScore=score;
    score=function(a){return Math.max(0,Math.min(10,previousScore(a)+laterDelta(a)));};
  }
  if(typeof setStatus==='function'){
    const previousSetStatus=setStatus;
    window.setStatus=setStatus=function(a,v){
      const before=hs(a).status||'new';
      // Mark interest before the existing status pipeline renders, so one render is enough.
      if(v==='later'&&before!=='later'){
        const cur=state?.[a.id]||{status:before,feedback:hs(a).feedback||null};
        markLaterInterest(a,cur,Date.now());
      }
      invalidate();
      return previousSetStatus(a,v);
    };
  }
  if(typeof renderPrefs==='function'){
    const previousPrefs=renderPrefs;
    renderPrefs=function(){
      previousPrefs();
      const root=document.getElementById('learnedPrefs');if(!root)return;
      const rows=samples();
      const subjectCounts={};
      for(const s of rows)for(const x of s.fp.subjects)subjectCounts[x]=(subjectCounts[x]||0)+s.w;
      const top=Object.entries(subjectCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k);
      const note=document.createElement('div');note.className='muted small precision-learning-note later-learning-note';
      note.textContent=`稍后看学习：${rows.length} 篇高权重兴趣样本${top.length?`；近期偏好 ${top.join(' / ')}`:''}。加入“稍后看”是最高权重正向行为；主动正反馈主要用于纠正评级偏低。读完移出不会撤销兴趣，明确负反馈/跳过可覆盖。`;
      root.appendChild(note);
    };
  }

  function boot(){migrateCurrentLater();invalidate();try{renderPrefs?.();}catch(_){};try{renderArticles?.();}catch(_){};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
  window.weeklyLaterLearningV27={samples,laterDelta,migrateCurrentLater,invalidate};
})();
