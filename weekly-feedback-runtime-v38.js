// Final score uses the reviewed content assessment and the user's local
// article-level history. Older broad-topic scores are deliberately not stacked.
(() => {
  const engine=window.weeklyFeedbackLearningV38,policy=window.weeklyPriorityPolicy;
  if(!engine||!policy||typeof score!=='function')return;
  let model=null,revision=0,rowsCount=-1;
  let articleById=new Map();
  function rows(){return window.weeklyUiFixesV25?.allRows?.()||(data?.articles||[]);}
  function getState(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function invalidate(){revision++;model=null;window.weeklyReadingTimeV21?.invalidate?.();}
  function activeModel(){
    const articles=rows();
    if(!model||rowsCount!==articles.length){
      rowsCount=articles.length;model=engine.makeModel(articles,getState);
      articleById=new Map(articles.map(a=>[String(a.id),a]));
    }
    return model;
  }
  score=function(a){
    const assessment=policy.assess(a);
    if(!assessment.eligible)return Math.min(assessment.score,assessment.cap);
    const learned=activeModel().explain(a);
    return Math.max(0,Math.min(assessment.score+learned.delta,assessment.cap,learned.cap));
  };
  if(typeof save==='function'){
    const previous=save;
    save=function(){invalidate();return previous();};
  }
  document.getElementById('resetLearning')?.addEventListener('click',invalidate,{capture:true});
  if(typeof renderArticles==='function'){
    const previousRender=renderArticles;
    renderArticles=function(){
      const output=previousRender();activeModel();
      document.querySelectorAll('#articleList .article[data-bulk-article-id]').forEach(card=>{
        const a=articleById.get(String(card.dataset.bulkArticleId)),scores=card.querySelector('.scores');
        if(!a||!scores)return;
        const e=model.explain(a),pos=e.positives[0],neg=e.negatives[0];
        if(Math.abs(e.delta)<.12||!pos&&!neg)return;
        const mark=document.createElement('span');mark.className='score preference-match-v38';
        mark.textContent=`历史反馈 ${e.delta>0?'↑':'↓'}${Math.abs(e.delta).toFixed(1)}`;
        const match=e.delta>0?pos:neg;
        mark.title=`参考你的「${match.reason}」：${match.title||'相近文章'}；仅用于排序，仍须通过正文价值审核`;
        scores.appendChild(mark);
      });
      return output;
    };
  }
  // Rendering uses the same cached model and per-article results until the
  // history changes; changing tabs and filters should never retrain it.
  function stats(){
    const current=activeModel(),marked=Object.entries(state||{}).filter(([,s])=>
      !!s&&(['later','save','skip'].includes(s.status)||Number(s.later_interest_at||0)>0||!!s.feedback));
    return {revision,samples:current.sampleCount,positive:current.positiveSamples,negative:current.negativeSamples,
      archived_without_vectors:current.archivedSamples,records_on_device:marked.length,
      unmatched_records:marked.filter(([id])=>!articleById.has(String(id))).length,articles:rowsCount};
  }
  if(typeof renderPrefs==='function'){
    const previousPrefs=renderPrefs;
    renderPrefs=function(){
      const output=previousPrefs(),root=document.getElementById('learnedPrefs');if(!root)return output;
      root.querySelector('.feedback-coverage-v38')?.remove();
      const s=stats(),note=document.createElement('div');note.className='muted small precision-learning-note feedback-coverage-v38';
      note.textContent=`本机历史覆盖：${s.records_on_device} 条有明确标记的记录，当前文章库之外 ${s.unmatched_records} 条；参与匹配的正向 ${s.positive}、负向 ${s.negative} 个信号。${s.archived_without_vectors?`${s.archived_without_vectors} 个旧文章信号缺少向量，只能按标题与内容形式弱匹配。`:''}其他设备的加密备份需主动恢复后才会参与。`;
      root.appendChild(note);return output;
    };
  }
  window.weeklyFeedbackRuntimeV38={explain:a=>activeModel().explain(a),stats,invalidate};
  invalidate();
  try{window.weeklyRuntimeConsistencyV35?.refreshPrioritySnapshots?.();}catch(_){}
})();
