// Temporal retrieval v7 for Work System.
(() => {
  const BASE_RAW=rawResults,BASE_HINT=renderIntentHint;
  const CHANGE_RE=/(变化|變化|趋势|趨勢|演变|演變|变迁|變遷|过去|過去|近\s*\d+\s*年|这几年|近年来|推移|トレンド|変化|変遷)/i;
  const CURRENT_RE=/(现在|現在|目前|如今|当下|最新|current|latest|今|いま)/i;
  function tm(a){const ev=a?.evidence_period,pub=a?.published_at,col=a?.collected_at||a?.date||'',d=a?.effective_date||ev?.end||pub||col||'';return{date:d,confidence:a?.temporal_confidence||(ev?'high':pub?'medium':'low'),sensitivity:a?.time_sensitive||'low'}}
  function freshness(t){if(!t.date)return 0;const y=Number(String(t.date).slice(0,4));if(!y)return 0;const age=Math.max(0,(new Date().getFullYear()+new Date().getMonth()/12)-y),tau=t.sensitivity==='high'?1.35:t.sensitivity==='medium'?3.0:8.0,conf=t.confidence==='high'?1:t.confidence==='medium'?.72:.35;return Math.exp(-age/tau)*conf}
  rawResults=function(ctx,excluded=new Set(),limit=10){
    const rows=BASE_RAW(ctx,excluded,Math.max(limit,16)),q=ctx?.raw||'';if(!q)return rows.slice(0,limit);
    if(CURRENT_RE.test(q)){
      rows.forEach(x=>{if(x.kind==='notion'&&x.article){const t=tm(x.article);x.temporal=t;x.score=(x.score||0)+(t.sensitivity==='low'?.5:2.2)*freshness(t)}});
      rows.sort((a,b)=>(b.score||0)-(a.score||0));return rows.slice(0,limit);
    }
    if(CHANGE_RE.test(q)){
      const notion=rows.filter(x=>x.kind==='notion'&&x.article),other=rows.filter(x=>x.kind!=='notion'||!x.article),byYear=new Map();
      notion.forEach(x=>{x.temporal=tm(x.article);const y=String(x.temporal.date||'unknown').slice(0,4);if(!byYear.has(y))byYear.set(y,[]);byYear.get(y).push(x)});for(const xs of byYear.values())xs.sort((a,b)=>(b.score||0)-(a.score||0));
      const years=[...byYear.keys()].filter(x=>/^20\d{2}$/.test(x)).sort(),diverse=[];years.forEach(y=>{const x=byYear.get(y)?.shift();if(x)diverse.push(x)});diverse.sort((a,b)=>String(a.temporal.date).localeCompare(String(b.temporal.date)));
      const rest=[...byYear.values()].flat().sort((a,b)=>(b.score||0)-(a.score||0));return [...other.slice(0,Math.max(2,Math.floor(limit/3))),...diverse,...rest].slice(0,Math.max(limit,10));
    }
    return rows.slice(0,limit);
  };
  renderIntentHint=function(ctx,ruleCount,rawCount){BASE_HINT(ctx,ruleCount,rawCount);const box=$w('queryIntentHint');if(!box||box.classList.contains('hidden')||!ctx?.raw)return;const old=box.querySelector('.temporal-v7-hint');if(old)old.remove();if(!(CHANGE_RE.test(ctx.raw)||CURRENT_RE.test(ctx.raw)))return;const s=document.createElement('small');s.className='temporal-v7-hint';s.textContent=CHANGE_RE.test(ctx.raw)?'时间模式：原始 Knowledge 会优先保留跨年份证据；完整时间线可在 Knowledge 搜同一问题。':'当前状态模式：高时效技术/消费者证据优先最新；低时效方法论不因年份自动降权。';box.appendChild(s)};
})();
