// Weekly v19: distinguish transport success from publication coverage completeness.
(() => {
  const baseRenderCoverage = typeof renderCoverage === 'function' ? renderCoverage : null;
  const coverageLabel = {enhanced:'增强覆盖',cached:'缓存覆盖',partial:'部分覆盖',unverified:'待验证'};
  const coverageClass = {enhanced:'status-ok',cached:'status-ok',partial:'status-pending',unverified:'status-pending'};
  const methodLabel = {
    feed_cache:'RSS日缓存',article_listing:'文章页',column_listing:'コラム页',new_article_listing:'新着页',
    serialization_listing:'连载页',conference_listing:'Conference页',official_listing:'官方列表',
    official_rss:'官方RSS',feeder:'Feeder',rolling_cache:'滚动缓存',direct_listing:'新着列表'
  };
  function methodText(s){
    const xs=(s.coverage_methods||[]).map(x=>methodLabel[x]||x);
    const cached=Number(s.coverage_cached_count||0);
    return `${xs.join(' + ')||'未配置二次发现'}${cached?` · 缓存${cached}篇`:''}`;
  }
  renderCoverage=function(){
    if(baseRenderCoverage)baseRenderCoverage();
    const rows=status?.sources||[],audit=status?.coverage_audit||{};
    const exp=status?.expected_sources??rows.length,ok=status?.successful_sources??0;
    const enhanced=Number(audit.enhanced_count||0),cached=Number(audit.cached_count||0),partial=Number(audit.partial_count||0),unverified=Number(audit.unverified_count||0);
    const pill=$('coveragePill');if(pill)pill.textContent=`抓取 ${ok}/${exp} · 增强 ${enhanced}`;
    const root=$('sourceCoverage');
    if(root){
      root.innerHTML=rows.map(s=>{
        const cv=s.coverage_status||'unverified',lab=coverageLabel[cv]||'待验证',cls=coverageClass[cv]||'status-pending';
        const transport=s.status==='ok'?`${s.new_count||0} 新增`:s.status==='failed'?'抓取失败':'待刷新';
        const errs=[s.error,...(s.coverage_errors||[])].filter(Boolean).join(' | ');
        return `<div class="coverage-item coverage-v19" title="${esc(errs)}"><span><b>${esc(short(s.name))}</b><small>${esc(methodText(s))}</small></span><span><span class="${s.status==='ok'?'status-ok':s.status==='failed'?'status-fail':'status-pending'}">${transport}</span><small class="${cls}">${lab}</small></span></div>`;
      }).join('');
    }
    const w=$('coverageWarning'),failed=status?.failed_sources||[];
    if(!status?.generated_at){
      if(w){w.classList.remove('hidden');w.textContent='首次数据刷新尚未运行。';}
    }else if(failed.length){
      if(w){w.classList.remove('hidden');w.textContent=`⚠ 抓取失败 ${failed.length} 个来源；覆盖状态请同时看右侧“来源覆盖”。`;}
    }else if(partial||unverified){
      if(w){w.classList.remove('hidden');w.textContent=`抓取 ${ok}/${exp} 成功，但“成功”不等于发布完整：部分覆盖 ${partial}，待验证 ${unverified}，缓存覆盖 ${cached}。`;}
    }else if(w){w.classList.add('hidden');}
  };
  const style=document.createElement('style');
  style.textContent=`.coverage-v19{align-items:flex-start}.coverage-v19>span{display:flex;flex-direction:column;gap:2px}.coverage-v19>span:last-child{align-items:flex-end}.coverage-v19 small{font-size:10px;line-height:1.25;opacity:.76;max-width:210px}.coverage-v19 .status-ok,.coverage-v19 .status-pending,.coverage-v19 .status-fail{white-space:nowrap}`;
  document.head.appendChild(style);
  if(status?.generated_at)renderCoverage();
})();
