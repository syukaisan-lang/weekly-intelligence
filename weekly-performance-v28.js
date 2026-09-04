// Weekly v28: fast client-side personalization for large article sets.
// Avoids browser-time 384-d vector scans on every article; server semantic scores stay in reading_score.
// Personalization in the browser uses lightweight explicit preferences, precise feedback reasons,
// and the user's strongest signal: Later history.
(() => {
  const featureCache=new Map();
  const scoreCache=new Map();
  let revision=0;

  const rawTyped=typeof typedFeatures==='function'?typedFeatures:null;
  function articleKey(a){return String(a?.id||a?.url||a?.title||'');}

  if(rawTyped){
    typedFeatures=function(a){
      const key=articleKey(a);
      if(key&&featureCache.has(key))return featureCache.get(key);
      const value=rawTyped(a);
      if(key)featureCache.set(key,value);
      return value;
    };
  }

  const NEG_REASON={too_generic:-.18,promo:-.30,not_work:-.34,known:-.12,no_evidence:-.20,topic:-.26};
  function clamp(x){return Math.max(0,Math.min(10,Number(x)||0));}
  function lightPersonalScore(a){
    let x=Number(a?.reading_score??a?.base_score??5);
    let f={topics:[],formats:[],intents:[],signals:[]};
    try{f=typedFeatures(a)||f;}catch(_){}

    // Explicit feedback preference model (cheap sparse features).
    try{
      if(typeof dimScore==='function'&&typeof prefs==='object'){
        x+=dimScore(prefs.topics||{},f.topics||[],4,.8);
        x+=dimScore(prefs.formats||{},f.formats||[],2,.8);
        x+=dimScore(prefs.intents||{},f.intents||[],2,1.0);
        x+=dimScore(prefs.signals||{},f.signals||[],2,.6);
      }
    }catch(_){}

    // Precise topic x format/intent transfer, retained without dense vector math.
    try{
      const p=window.weeklyLearningPrecisionV15;
      if(p){x+=Number(p.preciseDelta?.(a)||0);x+=Number(p.lowValueContextPenalty?.(a)||0);}
    }catch(_){}

    // Reason-specific correction signal.
    try{x+=Number(window.weeklyFocusFeedbackV17?.learnedReasonDelta?.(a)||0);}catch(_){}
    try{const s=typeof st==='function'?st(a.id):(state?.[a.id]||{});x+=NEG_REASON[s?.feedback_reason]||0;}catch(_){}

    // Later is the strongest positive behavioral signal.
    try{x+=Number(window.weeklyLaterLearningV27?.laterDelta?.(a)||0);}catch(_){}
    return clamp(x);
  }

  // Replace the final score chain with a cached lightweight equivalent.
  // reading_score already contains the server-side semantic/Knowledge/Work-System judgement.
  score=function(a){
    const key=articleKey(a),cached=key?scoreCache.get(key):null;
    if(cached&&cached.rev===revision)return cached.value;
    const value=lightPersonalScore(a);
    if(key)scoreCache.set(key,{rev:revision,value});
    return value;
  };

  function invalidate({features=false}={}){
    revision++;
    scoreCache.clear();
    if(features)featureCache.clear();
    try{window.weeklyLaterLearningV27?.invalidate?.();}catch(_){}
    try{window.weeklyMobilePerformanceV18?.invalidateScores?.();}catch(_){}
  }

  // Every state mutation already calls save(). Use that as one central invalidation point
  // instead of making each UI wrapper trigger multiple expensive recomputations.
  if(typeof save==='function'){
    const previousSave=save;
    save=function(){invalidate();return previousSave();};
  }

  document.getElementById('resetLearning')?.addEventListener('click',()=>invalidate(),{capture:true});

  // Cache lookups for card helpers used by several enhancement layers.
  let articleMap=null,articleMapLength=-1;
  function getArticleMap(){
    const rows=Array.isArray(data?.articles)?data.articles:[];
    if(!articleMap||articleMapLength!==rows.length){
      articleMapLength=rows.length;articleMap=new Map();
      for(const a of rows){
        if(a?.id)articleMap.set('id:'+a.id,a);
        if(a?.url)articleMap.set('url:'+a.url,a);
        if(a?.title)articleMap.set('title:'+a.title,a);
      }
    }
    return articleMap;
  }
  function findArticle({id,url,title}={}){
    const m=getArticleMap();
    return (id&&m.get('id:'+id))||(url&&m.get('url:'+url))||(title&&m.get('title:'+title))||null;
  }

  // Expose a tiny performance diagnostic for manual checks in DevTools if needed.
  window.weeklyPerformanceV28={
    invalidate,
    findArticle,
    stats:()=>({score_cache:scoreCache.size,feature_cache:featureCache.size,revision,articles:Array.isArray(data?.articles)?data.articles.length:0}),
    mode:'server-semantic + lightweight-client-personalization'
  };
})();
