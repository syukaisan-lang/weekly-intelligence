// Weekly v27.1: Later is the strongest positive recommendation signal.
// Explicit positive feedback is treated mainly as a correction signal; explicit negative feedback/skip can override Later.
(() => {
  const MARKER='later_interest';
  const DIRTY_KEY='weekly_intelligence_dirty_since_v1';
  const DAY=86400000;
  const MAX_AGE=180;
  let sampleCache=null;

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
    const fp=window.weeklyLearningPrecisionV15?.fingerprint?.(a)||{subjects:[],formats:[],intents:[],signals:[],raw:''};
    let topics=[];
    try{topics=typeof typedFeatures==='function'?(typedFeatures(a).topics||[]):[];}catch(_){}
    return {subjects:uniq(fp.subjects),topics:uniq(topics),formats:uniq(fp.formats),intents:uniq(fp.intents),signals:uniq(fp.signals),raw:fp.raw||''};
  }
  function isHeavy(fp){return /オンラインセミナー|ウェビナー|セミナー|イベント|カンファレンス|参加募集|申込|新製品|新商品|発売|キャンペーン|プレゼント|セール/i.test(fp.raw||'');}
  function sampleTs(a,s){return Number(s.later_interest_at||s.feedback_reason_updated_at||s.status_updated_at||s.updated_at||0)||Date.parse(a?.first_seen||a?.published||'')||0;}
  function hasLaterHistory(s){return s?.status==='later'||s?.feedback_reason===MARKER||Number(s?.later_interest_at||0)>0;}
  function isNegative(s){return ['bad','less'].includes(s?.feedback)||s?.status==='skip';}

  function buildSamples(){
    const rows=[];
    for(const a of data?.articles||[]){
      const s=hs(a);
      // Later is the strongest positive behavioral signal. Positive feedback does not suppress it.
      // Explicit negative feedback or an explicit skip is stronger evidence that the article should not train positive preference.
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
    // A single Later action should matter more than a routine explicit-positive correction.
    let v=.18+.34*core+.075*ctx+.055*sig;
    if(isHeavy(source)&&!isHeavy(target)&&ctx===0)v*=.35;
    return v;
  }
  function laterDelta(a){
    const target=features(a),vals=[];
    for(const s of samples()){
      if(s.id===String(a.id))continue;
      const sim=similarity(target,s.fp);if(sim>0)vals.push(sim*s.w);
    }
    vals.sort((a,b)=>b-a);
    // Highest positive preference channel, but still capped so base quality/evidence can matter.
    return Math.max(0,Math.min(1.15,vals.slice(0,4).reduce((n,x)=>n+x,0)));
  }
  function markLaterInterest(a,cur,when=Date.now()){
    if(!cur||isNegative(cur))return false;
    cur.later_interest_at=Math.max(Number(cur.later_interest_at||0),when);
    // Keep backwards compatibility with already-backed-up Later-interest records where possible.
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
    if(changed)sampleCache=null;
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
      const out=previousSetStatus(a,v);
      const cur=state?.[a.id]||{};
      const after=cur.status||'new';
      if(before!=='later'&&after==='later')markLaterInterest(a,cur,Date.now());
      // Leaving Later after reading/processing does NOT erase the strongest interest signal.
      sampleCache=null;
      setTimeout(()=>{try{renderArticles();}catch(_){}},0);
      return out;
    };
  }
  if(typeof renderArticles==='function'){
    const previousRender=renderArticles;
    renderArticles=function(){sampleCache=null;return previousRender();};
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

  function boot(){migrateCurrentLater();sampleCache=null;try{renderPrefs?.();}catch(_){};try{renderArticles?.();}catch(_){};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
  window.weeklyLaterLearningV27={samples,laterDelta,migrateCurrentLater,invalidate:()=>{sampleCache=null;}};
})();
