// Temporal labels/sorting for the ordinary Knowledge list.
// 普通列表按有效证据时间排序：调查/数据发生时间 > 发布日 > Notion 收录日。
(() => {
  const BASE_CURRENT_ROWS=currentRows;
  const BASE_RENDER_LIST=renderList;

  function temporalMeta(a){
    const ev=a?.evidence_period||null,pub=a?.published_at||null,col=a?.collected_at||a?.date||null;
    const effective=a?.effective_date||ev?.end||pub||col||'';
    const confidence=a?.temporal_confidence||(ev?'high':pub?'medium':'low');
    return {ev,pub,col,effective,confidence};
  }
  function displayLabel(a){
    const t=temporalMeta(a);
    if(t.ev){
      const raw=String(t.ev.label||'').trim();
      return `证据 ${raw||String(t.effective).slice(0,10)}`;
    }
    if(t.pub)return `发布 ${String(t.pub).slice(0,10)}`;
    if(t.col)return `收录 ${String(t.col).slice(0,10)}`;
    return '时间不明';
  }
  function sortKey(a){return temporalMeta(a).effective||'';}

  currentRows=function(){
    const rows=BASE_CURRENT_ROWS();
    const mode=document.getElementById('knowledgeSort')?.value||'newest';
    if(mode==='newest')rows.sort((a,b)=>sortKey(b).localeCompare(sortKey(a)));
    else if(mode==='oldest')rows.sort((a,b)=>sortKey(a).localeCompare(sortKey(b)));
    return rows;
  };

  function decorateDates(){
    const byTitle=new Map((K?.items||K?.recent_stock||[]).map(a=>[String(a.title||''),a]));
    document.querySelectorAll('.knowledge-article').forEach(card=>{
      const title=card.querySelector('.knowledge-title-button')?.textContent?.trim()||'';
      const a=byTitle.get(title);if(!a)return;
      const dateNode=card.querySelector('.article-top .meta .muted.small');if(!dateNode)return;
      const t=temporalMeta(a);dateNode.textContent=displayLabel(a);
      dateNode.title=t.confidence==='high'?'高置信：正文识别到调查/数据发生时间':t.confidence==='medium'?'中置信：使用文章发布日期':'低置信：仅有 Notion 收录时间，不能视为证据发生日';
    });
  }

  renderList=function(){BASE_RENDER_LIST();decorateDates();};
  window.addEventListener('knowledge-private-ready',()=>setTimeout(()=>{renderList();},40));
})();
