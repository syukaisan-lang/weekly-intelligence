// Weekly v25: stable status counts + simpler Later reading view + final UI reconciliation.
(() => {
  const JST=9*60*60*1000;
  const NEGATIVE=new Set(['bad','less']);
  let canonical=[];

  function rememberFullRows(){
    const rows=Array.isArray(data?.articles)?data.articles:[];
    if(rows.length>canonical.length)canonical=rows.slice();
    return canonical.length?canonical:rows;
  }
  function allRows(){return rememberFullRows();}
  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function safeGrade(a){try{return grade(score(a));}catch(_){return a?.grade||'C';}}
  function bucket(a){
    if(window.weeklyReconciliationV16?.bucket){try{return window.weeklyReconciliationV16.bucket(a);}catch(_){}}
    const s=hs(a),status=s.status||'new';
    if(status==='later')return 'later';
    if(status==='skip')return 'skip';
    if(status==='read'||status==='save'||NEGATIVE.has(s.feedback))return 'done';
    return ['S','A'].includes(safeGrade(a))?'queue':'c';
  }
  function weekStartMs(){
    const jst=new Date(Date.now()+JST),weekday=(jst.getUTCDay()+6)%7;
    return Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate()-weekday,0,0,0,0)-JST;
  }
  function seenMs(a){const x=Date.parse(a?.first_seen||a?.published||a?.date||'');return Number.isFinite(x)?x:0;}
  function isThisWeek(a){return seenMs(a)>=weekStartMs();}
  function marked(a){const s=hs(a);return (s.status||'new')!=='new'||!!s.feedback;}
  function laterScope(){
    const rp=typeof readingProgress!=='undefined'?readingProgress:'';
    const sf=document.getElementById('statusFilter')?.value||'all';
    return rp==='later'||sf==='later';
  }

  function topCounts(){
    const rows=allRows();
    const out={week:0,unread:0,later:0,marked:0,read:0,skip:0,all:rows.length};
    for(const a of rows){
      const s=hs(a),status=s.status||'new',b=bucket(a);
      if(isThisWeek(a))out.week++;
      if(b==='queue')out.unread++;
      if(status==='later')out.later++;
      if(status==='read'||status==='save')out.read++;
      if(status==='skip')out.skip++;
      if(marked(a))out.marked++;
    }
    return out;
  }
  function focusCount(){
    const rows=allRows();
    let n=0;
    for(const a of rows){
      const s=hs(a),g=safeGrade(a),ts=seenMs(a);
      if(!['S','A'].includes(g))continue;
      if(NEGATIVE.has(s.feedback))continue;
      if(['later','read','save','skip'].includes(s.status||'new'))continue;
      if(s.feedback&&!['accurate','more'].includes(s.feedback))continue;
      if(ts&&Date.now()-ts>=7*86400000)continue;
      n++;
    }
    return Math.min(30,Math.max(0,n));
  }
  function repairProgressCounts(){
    const c=topCounts();
    for(const [k,v] of Object.entries(c)){
      const el=document.querySelector(`[data-progress="${k}"] .segment-count`);if(el)el.textContent=String(v);
    }
    const focus=document.querySelector('[data-progress="focus"] .segment-count');if(focus)focus.textContent=String(focusCount());
    document.querySelectorAll('[data-progress]').forEach(btn=>btn.classList.toggle('active',typeof readingProgress!=='undefined'&&btn.dataset.progress===readingProgress));
  }

  function articleFromCard(card){
    const id=card?.dataset?.bulkArticleId;if(id){const hit=allRows().find(a=>String(a.id)===id);if(hit)return hit;}
    const link=card?.querySelector('.article-title');if(!link)return null;
    const href=link.getAttribute('href'),title=link.textContent.trim();
    return allRows().find(a=>a.url===href||a.title===title)||null;
  }
  function estimateMinutes(a){
    if(window.weeklyReadingTimeV21?.estimateMinutes){try{return window.weeklyReadingTimeV21.estimateMinutes(a);}catch(_){}}
    return Number(a?.estimated_reading_minutes||a?.reading_time_minutes||4)||4;
  }
  function shortHint(a){
    let s=String(a?.reason||a?.summary||'').replace(/^为什么选[:：]?\s*/,'').replace(/\s+/g,' ').trim();
    if(!s)return '保留标题和原文即可，按需要回看。';
    const first=s.split(/[。！？!?]/)[0].trim();
    const text=first||s;
    return text.length>58?text.slice(0,58)+'…':text;
  }
  function currentLaterRows(){
    const rows=allRows().filter(a=>hs(a).status==='later');
    return rows.filter(a=>{try{return typeof visible==='function'?visible(a):true;}catch(_){return true;}});
  }
  function laterModelFull(){
    const api=window.weeklyLaterManagerV23;if(!api?.model)return null;
    const original=data.articles;
    try{
      data.articles=allRows();api.invalidate?.();return api.model();
    }catch(_){return null;}finally{data.articles=original;}
  }
  function decorateLater(){
    const active=laterScope();
    document.body.classList.toggle('weekly-later-view',active);
    const knowledgeCard=document.getElementById('knowledgeRelationUnlockCard');
    if(knowledgeCard)knowledgeCard.classList.toggle('hidden',active||knowledgeCard.classList.contains('hidden'));
    document.querySelectorAll('#articleList .related-knowledge').forEach(x=>{x.style.display=active?'none':'';});
    if(!active)return;

    const directLater=typeof readingProgress!=='undefined'&&readingProgress==='later';
    const model=directLater?laterModelFull():null;
    const activeMode=document.querySelector('#weeklyLaterManager [data-later-mode].active')?.dataset?.laterMode||'recycle';
    const rows=directLater?(model?.[activeMode]||model?.recycle||[]):currentLaterRows();
    const all=model?.all||allRows().filter(a=>hs(a).status==='later');
    const mins=rows.reduce((n,a)=>n+estimateMinutes(a),0),allMins=all.reduce((n,a)=>n+estimateMinutes(a),0);

    const total=document.querySelector('#weeklyLaterManager .later-manager-total');
    if(total)total.textContent=`共 ${all.length} 篇 · ≈${allMins} 分钟`;
    const note=document.querySelector('#weeklyLaterManager .later-manager-note');
    if(note)note.textContent=`当前 ${rows.length} 篇 · 预计约 ${mins} 分钟。按需要回看，不做知识库关联。`;
    const vc=document.getElementById('visibleCount');
    if(vc)vc.textContent=`${rows.length} 篇 · ≈${mins}分钟`;

    let quick=document.getElementById('weeklyLaterQuickSummary');
    const head=document.querySelector('#articleList')?.previousElementSibling;
    if(!quick&&head){quick=document.createElement('div');quick.id='weeklyLaterQuickSummary';quick.className='later-quick-summary';head.insertAdjacentElement('afterend',quick);}
    if(quick){quick.hidden=false;quick.textContent=`稍后看：${rows.length} 篇 · 预计约 ${mins} 分钟 · 仅保留简短提示，不加载知识关联。`;}

    document.querySelectorAll('#articleList .article').forEach(card=>{
      const a=articleFromCard(card);if(!a)return;
      const scores=card.querySelector('.scores');
      if(scores&&!scores.querySelector('.reading-time-score')){
        const m=estimateMinutes(a),x=document.createElement('span');x.className='score reading-time-score';x.textContent=`≈ ${m} 分钟`;scores.appendChild(x);
      }
      let hint=card.querySelector('.later-quick-hint');
      if(!hint){hint=document.createElement('div');hint.className='later-quick-hint';const scoresNode=card.querySelector('.scores');(scoresNode||card.querySelector('.article-title'))?.insertAdjacentElement('afterend',hint);}
      if(hint)hint.textContent=`提示：${shortHint(a)}`;
      card.querySelectorAll('.related-knowledge').forEach(x=>x.style.display='none');
    });
  }

  function clearLaterDecorations(){
    if(laterScope())return;
    const quick=document.getElementById('weeklyLaterQuickSummary');if(quick)quick.hidden=true;
    document.querySelectorAll('#articleList .related-knowledge').forEach(x=>x.style.display='');
  }
  function finalize(){rememberFullRows();repairProgressCounts();decorateLater();clearLaterDecorations();}

  if(typeof updateProgressTabs==='function'){
    const previous=updateProgressTabs;
    updateProgressTabs=function(){const out=previous();repairProgressCounts();return out;};
  }
  if(typeof renderArticles==='function'){
    const previous=renderArticles;
    renderArticles=function(){rememberFullRows();const out=previous();setTimeout(finalize,0);return out;};
  }
  if(typeof setProgress==='function'){
    const previous=setProgress;
    window.setProgress=setProgress=function(key){const out=previous(key);setTimeout(finalize,0);return out;};
  }
  ['gradeFilter','statusFilter','sourceFilter','personalizedSort'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(finalize,0)));
  document.addEventListener('click',e=>{if(e.target.closest('[data-later-mode]'))setTimeout(finalize,0);});

  const observer=new MutationObserver(()=>{if(laterScope())decorateLater();});
  const list=document.getElementById('articleList');if(list)observer.observe(list,{childList:true,subtree:false});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(finalize,0));else setTimeout(finalize,0);
  window.weeklyUiFixesV25={allRows,repairProgressCounts,decorateLater,laterScope,currentLaterRows};
})();