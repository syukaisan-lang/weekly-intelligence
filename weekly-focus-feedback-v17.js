// v17: lightweight focus queue + precise negative-feedback reasons.
(() => {
  const VIEW_KEY='weekly_intelligence_view_v2';
  const REASONS=[
    ['too_generic','太泛'],['promo','活动/宣传'],['not_work','和工作无关'],
    ['known','已经知道'],['no_evidence','缺数据/案例'],['topic','主题不感兴趣']
  ];
  const REASON_WEIGHTS={too_generic:-.18,promo:-.30,not_work:-.34,known:-.12,no_evidence:-.20,topic:-.26};
  const scoreCache=new Map();

  function safeScore(a){const id=String(a?.id||'');if(scoreCache.has(id))return scoreCache.get(id);let s=5;try{s=Number(score(a))||5;}catch(_){s=Number(a?.reading_score??5)||5;}scoreCache.set(id,s);return s;}
  function safeGrade(a){try{return grade(safeScore(a));}catch(_){return a?.grade||'C';}}
  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function isQueue(a){
    const s=hs(a),g=safeGrade(a),ts=Date.parse(a?.first_seen||a?.published||'');
    if(!['S','A','B'].includes(g)||s.feedback||s.status==='later'||s.status==='read'||s.status==='save'||s.status==='skip')return false;
    if(Number.isFinite(ts)&&Date.now()-ts>=7*86400000)return false;
    return true;
  }
  function focusValue(a){
    const kc=a?.knowledge_context||{};let v=safeScore(a),inc=kc.increment_type||'';
    if(safeGrade(a)==='S')v+=1.15;
    if(inc==='direct_work_use')v+=.55;if(inc==='knowledge_gap')v+=.48;if(inc==='rule_evidence')v+=.42;if(inc==='boundary_or_counterexample')v+=.45;if(inc==='mostly_duplicate')v-=.62;
    v+=Math.min(.36,Number(kc.evidence_bonus||0)*.35+Number(kc.boundary_bonus||0)*.25);return v;
  }
  function focusLimit(rows){const strong=rows.filter(a=>safeGrade(a)==='S'||safeScore(a)>=7.8).length;return Math.max(15,Math.min(30,Math.max(18,strong+8)));}
  function focusRows(){const rows=(data?.articles||[]).filter(isQueue).sort((a,b)=>focusValue(b)-focusValue(a));return rows.slice(0,focusLimit(rows));}
  function focusIds(){return new Set(focusRows().map(a=>String(a.id)));}

  if(typeof visible==='function'){
    const prevVisible=visible;
    visible=function(a){
      if(typeof readingProgress==='undefined'||readingProgress!=='focus')return prevVisible(a);
      const old=readingProgress;try{readingProgress='unread';return prevVisible(a)&&focusIds().has(String(a.id));}finally{readingProgress=old;}
    };
  }

  function ensureFocusTab(){
    const seg=document.querySelector('.segmented');if(!seg||seg.querySelector('[data-progress="focus"]'))return;
    const b=document.createElement('button');b.className='segment-btn';b.type='button';b.dataset.progress='focus';b.innerHTML='优先阅读 <span class="segment-count">0</span>';
    seg.prepend(b);b.addEventListener('click',()=>setProgress?.('focus'));
  }
  function updateFocusTab(){ensureFocusTab();const el=document.querySelector('[data-progress="focus"] .segment-count');if(el)el.textContent=String(focusRows().length);document.querySelectorAll('[data-progress]').forEach(x=>x.classList.toggle('active',x.dataset.progress===readingProgress));}

  function reasonPenalty(a){return REASON_WEIGHTS[hs(a).feedback_reason]||0;}
  if(typeof score==='function'){const prevScore=score;score=function(a){return Math.max(0,Math.min(10,prevScore(a)+reasonPenalty(a)));};}
  function articleFromCard(card){const link=card.querySelector('.article-title');if(!link)return null;const href=link.getAttribute('href'),title=link.textContent.trim();return (data?.articles||[]).find(a=>a.url===href||a.title===title)||null;}
  function findCard(a){return [...document.querySelectorAll('#articleList .article')].find(c=>articleFromCard(c)?.id===a.id)||null;}
  function persistReason(a,key){const raw=state?.[a.id]||{};if(key)raw.feedback_reason=key;else delete raw.feedback_reason;raw.feedback_reason_updated_at=Date.now();state[a.id]=raw;save();scoreCache.clear();}

  let commitFeedback=null;
  function openReasonPicker(a,v){
    const card=findCard(a);if(!card){commitFeedback?.(a,v);return;}
    card.querySelector('.feedback-reasons')?.remove();
    const box=document.createElement('div');box.className='feedback-reasons';
    box.innerHTML=`<span class="feedback-reason-label">为什么不要？</span>${REASONS.map(([k,t])=>`<button type="button" data-reason="${k}" class="reason-chip">${t}</button>`).join('')}<button type="button" data-reason="" class="reason-chip reason-skip">不选原因</button>`;
    card.querySelector('.controls')?.appendChild(box);requestAnimationFrame(()=>box.classList.add('show'));
    box.querySelectorAll('[data-reason]').forEach(btn=>btn.addEventListener('click',()=>{
      persistReason(a,btn.dataset.reason||null);
      box.querySelectorAll('.reason-chip').forEach(x=>x.classList.toggle('active',x===btn));
      box.classList.add('committing');setTimeout(()=>commitFeedback?.(a,v),90);
    },{once:true}));
  }

  if(typeof feedback==='function'){
    commitFeedback=feedback;
    feedback=function(a,v){
      const current=hs(a).feedback;
      if(['bad','less'].includes(v)&&current!==v){openReasonPicker(a,v);return;}
      return commitFeedback(a,v);
    };
  }

  if(typeof renderArticles==='function'){
    const prevRender=renderArticles;
    renderArticles=function(){
      scoreCache.clear();prevRender();updateFocusTab();
      const hint=document.getElementById('weeklyAttentionHint');
      if(readingProgress==='focus'&&hint)hint.textContent=`优先阅读：从当前 S/A/B 队列中按个人分、工作直接性、知识增量与重复度选出 ${focusRows().length} 篇。完整候选仍在“当前队列”。`;
    };
  }

  try{const saved=JSON.parse(localStorage.getItem(VIEW_KEY)||'{}')||{};if(saved.progress==='focus'&&typeof readingProgress!=='undefined')readingProgress='focus';else if(!saved.progress&&typeof readingProgress!=='undefined')readingProgress='focus';}catch(_){}
  ensureFocusTab();updateFocusTab();
  window.weeklyFocusFeedbackV17={focusRows,focusValue,reasonPenalty,updateFocusTab};
})();
