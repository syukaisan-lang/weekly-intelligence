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
  function personalizedAssessment(a){
    const editorial=policy.assess(a);
    if(editorial.eligible)return {...editorial,personalized:false};
    const learned=activeModel().explain(a),positives=learned.positives||[],negatives=learned.negatives||[];
    const strongest=Number(positives[0]?.strength||0);
    const positiveSum=positives.slice(0,2).reduce((n,x)=>n+Math.max(0,Number(x.strength||0)),0);
    const negativeSum=Math.abs(negatives.slice(0,2).reduce((n,x)=>n+Math.min(0,Number(x.strength||0)),0));
    const strongLater=positives.some(x=>x.reason==='稍后看'&&Number(x.strength||0)>=.48);
    // A B-grade article may be a false negative when its public body is incomplete.
    // Rescue only source-relevant "uncertain" items that closely match the user's own
    // Later/positive history. Announcements, promotions, generic briefs and explicit
    // negative patterns remain blocked by the editorial decision and negative guard.
    const rescued=editorial.decision==='待核验'&&!!editorial.domain&&negativeSum<.28&&
      (strongLater||strongest>=.62||(positives.length>=2&&positiveSum>=.78));
    if(!rescued)return {...editorial,personalized:false,learned};
    const promotedScore=Math.min(8.3,7.25+Math.max(0,positiveSum-.45)*.8);
    return {...editorial,eligible:true,score:promotedScore,cap:8.3,decision:'偏好补漏',
      reason:'与你多次主动留下的具体内容高度相似；公开正文依据仍不足，建议快速判断',
      kind:'preference_rescue',confidence:'personalized',personalized:true,learned};
  }
  score=function(a){
    const assessment=personalizedAssessment(a);
    if(!assessment.eligible)return Math.min(assessment.score,assessment.cap);
    if(assessment.personalized)return assessment.score;
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
  document.addEventListener('click',event=>{
    const link=event.target?.closest?.('#articleList .article-title,#articleList .weekly-open-original');if(!link)return;
    const card=link.closest('.article[data-bulk-article-id]'),a=card&&articleById.get(String(card.dataset.bulkArticleId));
    if(!a||String(a.grade||'')!=='B')return;
    const current=getState(a);if(['bad','less'].includes(current.feedback)||current.status==='skip'||current.feedback_reason==='manual_b_pick')return;
    const now=Date.now();state[a.id]={...current,feedback_reason:'manual_b_pick',feedback_reason_updated_at:now,updated_at:now};
    if(typeof save==='function')save();
  },true);
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
  window.weeklyFeedbackRuntimeV38={explain:a=>activeModel().explain(a),personalizedAssessment,stats,invalidate};
  invalidate();
  try{window.weeklyRuntimeConsistencyV35?.refreshPrioritySnapshots?.();}catch(_){}
})();
