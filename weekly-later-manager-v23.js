// Weekly v23: lightweight Later backlog management.
// Keeps every Later bookmark visible while limiting daily attention to a small weekly recycle set.
(() => {
  const MODE_KEY='weekly_intelligence_later_mode_v23';
  const RECYCLE_KEY='weekly_intelligence_later_recycle_v23';
  const DAY=86400000;
  const RECENT_DAYS=21;
  const RECYCLE_MIN_DAYS=7;
  const RECYCLE_SIZE=5;
  const VALID_MODES=new Set(['recycle','recent','long','all']);
  let mode=localStorage.getItem(MODE_KEY)||'recycle';
  if(!VALID_MODES.has(mode))mode='recycle';
  let modelCache=null;

  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function laterSince(a){
    const s=hs(a);
    const candidates=[Number(s.status_updated_at||0),Number(s.updated_at||0),Date.parse(a?.first_seen||a?.published||'')||0].filter(x=>x>0);
    return candidates.length?candidates[0]:Date.now();
  }
  function ageDays(a){return Math.max(0,Math.floor((Date.now()-laterSince(a))/DAY));}
  function estimateMinutes(a){
    if(window.weeklyReadingTimeV21?.estimateMinutes){try{return window.weeklyReadingTimeV21.estimateMinutes(a);}catch(_){}}
    return 4;
  }
  function weekKeyJst(){
    const JST=9*60*60*1000,jst=new Date(Date.now()+JST),weekday=(jst.getUTCDay()+6)%7;
    return new Date(Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate()-weekday)).toISOString().slice(0,10);
  }
  function laterRows(){return (Array.isArray(data?.articles)?data.articles:[]).filter(a=>hs(a).status==='later');}
  function lightValue(a){
    const r=Number(a?.reading_score??a?.base_score??5),n=Number(a?.notion_score??4),g=String(a?.grade||''),s=hs(a),age=ageDays(a),mins=estimateMinutes(a);
    const gradeBonus=g==='S'?.75:g==='A'?.38:g==='B'?.12:0;
    const feedbackBonus=s.feedback==='more'?.45:s.feedback==='accurate'?.28:0;
    const agePenalty=Math.min(1.25,Math.max(0,age-21)*.018);
    const coldPenalty=a?.storage_tier==='cold'?.12:0;
    return r*.82+n*.18+gradeBonus+feedbackBonus-agePenalty-coldPenalty-Math.min(.35,mins*.025);
  }
  function weeklyRecycle(rows){
    const key=weekKeyJst();
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(RECYCLE_KEY)||'null');}catch(_){}
    const byId=new Map(rows.map(a=>[String(a.id),a]));
    if(saved?.week===key&&Array.isArray(saved.ids)){
      return saved.ids.map(id=>byId.get(String(id))).filter(Boolean);
    }
    const eligible=rows.filter(a=>ageDays(a)>=RECYCLE_MIN_DAYS).sort((a,b)=>lightValue(b)-lightValue(a)||laterSince(a)-laterSince(b));
    const selected=eligible.slice(0,RECYCLE_SIZE);
    try{localStorage.setItem(RECYCLE_KEY,JSON.stringify({week:key,ids:selected.map(a=>String(a.id)),created_at:Date.now()}));}catch(_){}
    return selected;
  }
  function buildModel(){
    const all=laterRows(),recent=[],long=[];
    for(const a of all)(ageDays(a)<=RECENT_DAYS?recent:long).push(a);
    recent.sort((a,b)=>laterSince(b)-laterSince(a));
    long.sort((a,b)=>lightValue(b)-lightValue(a)||laterSince(b)-laterSince(a));
    const recycle=weeklyRecycle(all);
    const cold=all.filter(a=>a?.storage_tier==='cold').length;
    return {
      all,recent,long,recycle,cold,
      sets:{
        all:new Set(all.map(a=>String(a.id))),
        recent:new Set(recent.map(a=>String(a.id))),
        long:new Set(long.map(a=>String(a.id))),
        recycle:new Set(recycle.map(a=>String(a.id)))
      }
    };
  }
  function model(){return modelCache||(modelCache=buildModel());}
  function invalidate(){modelCache=null;}
  function selectedRows(){const m=model();return m[mode]||m.recycle;}

  if(typeof visible==='function'){
    const previousVisible=visible;
    visible=function(a){
      if(typeof readingProgress==='undefined'||readingProgress!=='later')return previousVisible(a);
      // Later is an explicit bookmark queue: do not run heavy personalized/semantic scoring here.
      if(hs(a).status!=='later')return false;
      const src=document.getElementById('sourceFilter')?.value||'all';
      if(src!=='all'&&a.source!==src)return false;
      return model().sets[mode].has(String(a.id));
    };
  }

  function ensurePanel(){
    let panel=document.getElementById('weeklyLaterManager');
    if(panel)return panel;
    panel=document.createElement('section');panel.id='weeklyLaterManager';panel.className='later-manager card';panel.hidden=true;
    panel.innerHTML=`<div class="later-manager-head"><div><div class="eyebrow">LATER QUEUE</div><h3>稍后看整理</h3></div><div class="later-manager-total"></div></div>
      <div class="later-manager-tabs">
        <button type="button" data-later-mode="recycle"><span>本周回收</span><b>0</b><small>旧积压精选</small></button>
        <button type="button" data-later-mode="recent"><span>最近加入</span><b>0</b><small>0–21天</small></button>
        <button type="button" data-later-mode="long"><span>长期积压</span><b>0</b><small>22天以上</small></button>
        <button type="button" data-later-mode="all"><span>全部稍后看</span><b>0</b><small>完整历史</small></button>
      </div>
      <div class="later-manager-note"></div>`;
    document.getElementById('articleList')?.insertAdjacentElement('beforebegin',panel);
    panel.querySelectorAll('[data-later-mode]').forEach(btn=>btn.addEventListener('click',()=>{
      mode=btn.dataset.laterMode||'recycle';localStorage.setItem(MODE_KEY,mode);
      window.weeklyMobilePerformanceV18?.resetLimit?.();renderArticles();
    }));
    return panel;
  }
  function updatePanel(){
    const panel=ensurePanel(),active=typeof readingProgress!=='undefined'&&readingProgress==='later';panel.hidden=!active;if(!active)return;
    const m=model(),rows=selectedRows(),mins=rows.reduce((n,a)=>n+estimateMinutes(a),0);
    const counts={recycle:m.recycle.length,recent:m.recent.length,long:m.long.length,all:m.all.length};
    panel.querySelectorAll('[data-later-mode]').forEach(btn=>{
      const k=btn.dataset.laterMode;btn.classList.toggle('active',k===mode);const b=btn.querySelector('b');if(b)b.textContent=String(counts[k]||0);
    });
    const total=panel.querySelector('.later-manager-total');if(total)total.textContent=`共 ${m.all.length} 篇`;
    const note=panel.querySelector('.later-manager-note');
    if(note){
      if(mode==='recycle')note.innerHTML=`每周从放置 ≥${RECYCLE_MIN_DAYS} 天的旧 Later 中轻量挑最多 ${RECYCLE_SIZE} 篇；当前约 <b>${mins} 分钟</b>。不做全文或语义重算。`;
      else if(mode==='recent')note.textContent='最近加入保留完整列表，适合先处理本周和上周刚放进来的内容。';
      else if(mode==='long')note.innerHTML=`长期积压默认按轻量价值排序。${m.cold?`其中 <b>${m.cold}</b> 篇已进入 90天+ 轻量归档，但标题和原文链接仍保留。`:''}`;
      else note.innerHTML=`全部 ${m.all.length} 篇 Later 都在这里；${m.cold?`包含 ${m.cold} 篇 90天+ 轻量归档。`:''}`;
    }
    const vc=document.getElementById('visibleCount');if(vc)vc.textContent=`${rows.length} 篇${mode==='recycle'?` · ≈${mins}分钟`:''}`;
  }
  function articleFromCard(card){
    const link=card.querySelector('.article-title');if(!link)return null;const href=link.getAttribute('href'),title=link.textContent.trim();
    return (data?.articles||[]).find(a=>a.url===href||a.title===title)||null;
  }
  function annotateCards(){
    if(typeof readingProgress==='undefined'||readingProgress!=='later')return;
    document.querySelectorAll('#articleList .article').forEach(card=>{
      if(card.querySelector('.later-age-badge'))return;const a=articleFromCard(card);if(!a)return;
      const meta=card.querySelector('.meta');if(!meta)return;const age=ageDays(a),x=document.createElement('span');x.className='later-age-badge';
      x.textContent=`稍后看 ${age} 天${a?.storage_tier==='cold'?' · 轻量归档':''}`;meta.appendChild(x);
    });
  }

  if(typeof renderArticles==='function'){
    const previousRender=renderArticles;
    renderArticles=function(){
      const isLater=typeof readingProgress!=='undefined'&&readingProgress==='later';
      if(!isLater){previousRender();updatePanel();return;}
      const m=model(),ordered=(m[mode]||m.recycle),ids=new Set(ordered.map(a=>String(a.id))),full=Array.isArray(data?.articles)?data.articles:[];
      const arranged=[...ordered,...full.filter(a=>!ids.has(String(a.id)))];
      const sortToggle=document.getElementById('personalizedSort'),wasChecked=!!sortToggle?.checked;
      // Preserve the user's global sort setting, but render Later from the lightweight cached order.
      try{
        data.articles=arranged;if(sortToggle)sortToggle.checked=false;previousRender();
      }finally{
        data.articles=full;if(sortToggle)sortToggle.checked=wasChecked;
      }
      updatePanel();annotateCards();
    };
  }
  if(typeof setProgress==='function'){
    const previousSetProgress=setProgress;
    window.setProgress=setProgress=function(key){
      if(key==='later'){invalidate();const gf=document.getElementById('gradeFilter'),sf=document.getElementById('statusFilter');if(gf)gf.value='ALL';if(sf)sf.value='all';}
      const out=previousSetProgress(key);setTimeout(updatePanel,0);return out;
    };
  }
  if(typeof setStatus==='function'){
    const previousSetStatus=setStatus;
    window.setStatus=setStatus=function(a,v){invalidate();const out=previousSetStatus(a,v);invalidate();return out;};
  }
  for(const id of ['gradeFilter','statusFilter','sourceFilter'])document.getElementById(id)?.addEventListener('change',()=>{if(typeof readingProgress!=='undefined'&&readingProgress==='later')setTimeout(updatePanel,0);});

  // Historical Later recovery mutates state directly rather than through setStatus. Invalidate the lightweight index after it finishes.
  const integrity=window.weeklyStateIntegrityV22;
  if(integrity?.recoverHistoricalLater&&!integrity.__laterManagerV23){
    const previousRecover=integrity.recoverHistoricalLater.bind(integrity);
    integrity.recoverHistoricalLater=async(...args)=>{
      invalidate();const out=await previousRecover(...args);invalidate();
      if(typeof readingProgress!=='undefined'&&readingProgress==='later')renderArticles();
      return out;
    };
    integrity.__laterManagerV23=true;
  }

  ensurePanel();updatePanel();
  window.weeklyLaterManagerV23={model,invalidate,ageDays,lightValue,weeklyRecycle};
})();
