// Weekly v26: explicit sorting by reading time, grade, or added time.
(() => {
  const SORT_KEY='weekly_intelligence_sort_v26';
  const VALID=new Set(['default','time_asc','time_desc','grade_desc','grade_asc','added_desc','added_asc']);
  let mode=localStorage.getItem(SORT_KEY)||'default';
  if(!VALID.has(mode))mode='default';

  function safeScore(a){try{return Number(score(a))||0;}catch(_){return Number(a?.reading_score??a?.base_score??0)||0;}}
  function safeGrade(a){try{return grade(safeScore(a));}catch(_){return String(a?.grade||'C');}}
  function gradeRank(a){return ({S:4,A:3,B:2,C:1})[safeGrade(a)]||0;}
  function addedTs(a){
    const x=Date.parse(a?.first_seen||a?.published||a?.date||'');
    return Number.isFinite(x)?x:0;
  }
  function estimateMinutes(a){
    if(window.weeklyReadingTimeV21?.estimateMinutes){
      try{return Number(window.weeklyReadingTimeV21.estimateMinutes(a))||4;}catch(_){}
    }
    const explicit=Number(a?.reading_time_minutes||a?.estimated_reading_minutes||0);
    if(explicit>0)return explicit;
    const chars=Number(a?.content_char_count||0);
    if(chars>0)return Math.max(2,Math.min(15,Math.ceil(chars/600)));
    return 4;
  }
  function cmp(a,b){
    if(mode==='time_asc')return estimateMinutes(a)-estimateMinutes(b)||safeScore(b)-safeScore(a)||addedTs(b)-addedTs(a);
    if(mode==='time_desc')return estimateMinutes(b)-estimateMinutes(a)||safeScore(b)-safeScore(a)||addedTs(b)-addedTs(a);
    if(mode==='grade_desc')return gradeRank(b)-gradeRank(a)||safeScore(b)-safeScore(a)||addedTs(b)-addedTs(a);
    if(mode==='grade_asc')return gradeRank(a)-gradeRank(b)||safeScore(a)-safeScore(b)||addedTs(b)-addedTs(a);
    if(mode==='added_desc')return addedTs(b)-addedTs(a)||safeScore(b)-safeScore(a);
    if(mode==='added_asc')return addedTs(a)-addedTs(b)||safeScore(b)-safeScore(a);
    return 0;
  }

  function installSelector(){
    let sel=document.getElementById('articleSort');
    if(sel)return sel;
    const groups=document.querySelectorAll('.toolbar .toolbar-group');
    const host=groups[0];if(!host)return null;
    const label=document.createElement('label');
    label.className='article-sort-label';label.textContent='排序';
    sel=document.createElement('select');sel.id='articleSort';
    sel.innerHTML=`<option value="default">当前推荐顺序</option>
      <option value="time_asc">阅读时长：短 → 长</option>
      <option value="time_desc">阅读时长：长 → 短</option>
      <option value="grade_desc">等级：高 → 低</option>
      <option value="grade_asc">等级：低 → 高</option>
      <option value="added_desc">加入时间：新 → 旧</option>
      <option value="added_asc">加入时间：旧 → 新</option>`;
    sel.value=mode;label.appendChild(sel);host.appendChild(label);
    sel.addEventListener('change',()=>{
      mode=VALID.has(sel.value)?sel.value:'default';
      localStorage.setItem(SORT_KEY,mode);syncPersonalToggle();
      window.weeklyMobilePerformanceV18?.resetLimit?.();
      if(typeof renderArticles==='function')renderArticles();
    });
    return sel;
  }
  function syncPersonalToggle(){
    const toggle=document.getElementById('personalizedSort');
    if(!toggle)return;
    const custom=mode!=='default';toggle.disabled=custom;
    const label=toggle.closest('label');if(label)label.style.opacity=custom?'.45':'';
  }
  function articleForCard(card){
    const id=card?.dataset?.bulkArticleId;
    if(id){const hit=(data?.articles||[]).find(a=>String(a.id)===String(id));if(hit)return hit;}
    const link=card?.querySelector('.article-title');if(!link)return null;
    const href=link.getAttribute('href'),title=link.textContent.trim();
    return (data?.articles||[]).find(a=>a.url===href||a.title===title)||null;
  }
  function sortRenderedCards(){
    if(mode==='default')return;
    const list=document.getElementById('articleList');if(!list)return;
    const cards=[...list.querySelectorAll(':scope > .article')];
    cards.sort((x,y)=>{
      const a=articleForCard(x),b=articleForCard(y);if(!a||!b)return 0;return cmp(a,b);
    });
    for(const card of cards)list.appendChild(card);
  }

  installSelector();syncPersonalToggle();

  if(typeof renderArticles==='function'){
    const previousRender=renderArticles;
    renderArticles=function(){
      if(mode==='default')return previousRender();
      const full=Array.isArray(data?.articles)?data.articles:[];
      const ordered=full.slice().sort(cmp);
      const toggle=document.getElementById('personalizedSort'),wasChecked=!!toggle?.checked;
      let out;
      try{
        data.articles=ordered;
        if(toggle)toggle.checked=false;
        out=previousRender();
      }finally{
        data.articles=full;
        if(toggle)toggle.checked=wasChecked;
      }
      sortRenderedCards();
      setTimeout(sortRenderedCards,0);
      return out;
    };
  }

  const style=document.createElement('style');
  style.textContent='.article-sort-label{min-width:190px}.article-sort-label select{min-width:190px}@media(max-width:900px){.article-sort-label,.article-sort-label select{min-width:160px}}';
  document.head.appendChild(style);

  window.weeklySortV26={getMode:()=>mode,estimateMinutes,gradeRank,addedTs};
})();
