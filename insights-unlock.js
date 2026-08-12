(() => {
  async function refreshPrivateInsights(){
    const full=await loadKnowledgeData({prompt:true});
    if(full.locked){
      document.getElementById('longTermTopics').innerHTML='<div class="empty"><h3>🔐 Insights 还未解锁</h3><p>Insights 需要解密 Knowledge 全文与 Comment。</p><button id="unlockInsightsNow" class="btn" type="button">解锁 Insights</button></div>';
      document.getElementById('unlockInsightsNow')?.addEventListener('click',refreshPrivateInsights);
      return;
    }
    IK=full;
    document.getElementById('insightsUpdated').textContent=IK.meta?.snapshot_at?`知识库 ${new Date(IK.meta.snapshot_at).toLocaleString('ja-JP')}`:'知识库已解锁';
    renderMetrics();renderLongTerm();renderShift();renderWeeklyConnections();renderGaps();renderReview();renderCommentConcepts();renderHealth();
  }
  const wait=()=>{
    if(typeof IK!=='undefined'&&IK.meta){if(IK.meta.encrypted_full_data)refreshPrivateInsights();}
    else setTimeout(wait,80);
  };
  wait();
})();
