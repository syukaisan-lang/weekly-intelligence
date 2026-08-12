(() => {
  async function refreshPrivateKnowledge(){
    const full=await loadKnowledgeData({prompt:true});
    if(full.locked){
      const list=document.getElementById('knowledgeList');
      if(list)list.innerHTML='<div class="empty"><h3>🔐 Knowledge 还未解锁</h3><p>输入 Dashboard 密码后，浏览器才会解密全量 Stock、summary 和 Comment。密码只保存在当前浏览器 session。</p><button id="unlockKnowledgeNow" class="btn" type="button">解锁 Knowledge</button></div>';
      document.getElementById('unlockKnowledgeNow')?.addEventListener('click',refreshPrivateKnowledge);
      return;
    }
    K=full;
    const snap=K.meta?.snapshot_at;
    document.getElementById('knowledgeUpdated').textContent=snap?`Notion同步 ${new Date(snap).toLocaleString('ja-JP')}`:'Notion已解锁';
    renderMetrics();renderCategoryTags();renderCategories();renderTopics();renderList();renderResurface();renderInsights();
  }
  const wait=()=>{
    if(typeof K!=='undefined'&&K.meta){
      if(K.meta.encrypted_full_data)refreshPrivateKnowledge();
    }else setTimeout(wait,80);
  };
  wait();
})();
