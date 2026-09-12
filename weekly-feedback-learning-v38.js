// Learn from the user's own positive and negative reading history without
// exporting that history. Editorial eligibility is decided separately.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.weeklyFeedbackLearningV38=api;
})(typeof window==='object'?window:this,function(){
  const DAY=86400000;
  const NEG=new Set(['bad','less']);
  const GENERIC=new Set(['AI','EC','データ','マーケティング','市場','調査','広告','消費者','顧客','ブランド']);
  const SUBJECTS=[
    ['AI业务流程',/AIエージェント|生成AI.{0,20}(業務|運用|活用)|Claude|ChatGPT|LLM/i],
    ['EC平台运营',/Amazon|楽天|ECモール|eコマース|EC運営|D2C/i],
    ['消费者研究',/購買行動|インサイト|顧客理解|消費者調査|生活者調査/i],
    ['广告投放',/ROAS|CPA|運用型広告|広告効果|広告運用/i],
    ['品牌策略',/ブランド戦略|ブランディング|ポジショニング/i],
    ['价格促销',/価格|値上げ|値下げ|割引|クーポン/i],
    ['CRM经营',/CRM|NPS|LTV|ロイヤルティ|リテンション/i]
  ];
  const NOTICE=/オンラインセミナー|ウェビナー|参加募集|申込|申し込み|開催日時|参加費/i;
  const PROMO=/新製品|新商品|新サービス|発売|提供開始|キャンペーン|プレゼント/i;
  const RECAP=/開催レポート|講演レポート|イベントレポート|セミナーレポート/i;
  const EVIDENCE=/調査|実証|検証|実験|事例|ケース|データ|統計|分析|\d+(?:\.\d+)?\s*(?:%|倍|ポイント)/i;
  const METHOD=/方法|手法|フレームワーク|運用|プロセス|分析|設計|検証|改善/i;
  const CONSUMER=/消費者|生活者|購買|購入|顧客理解|インサイト/i;
  const WORK=/EC|Amazon|楽天|広告|市場|マーケ|顧客|CRM|CVR|価格|競合|販売/i;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  function family(a){
    const text=String(a.title||'');
    if(NOTICE.test(text)&&!RECAP.test(text))return 'event';
    if(PROMO.test(text)&&!RECAP.test(text))return 'promo';
    return 'substance';
  }
  function dimensions(a){
    const f=a.learning_features||{};
    const source=String(a.title||'')+' '+String(a.summary||'').slice(0,240);
    const topics=new Set((f.topics||a.concepts||[]).filter(x=>!GENERIC.has(x)));
    for(const [name,re] of SUBJECTS)if(re.test(source))topics.add(name);
    for(const acronym of String(a.title||'').match(/[A-Za-z][A-Za-z0-9-]{2,}/g)||[])
      if(!/^(?:the|and|for|with|from|new|ai|ec|data|marketing)$/i.test(acronym))topics.add(acronym.toLowerCase());
    return {
      topics,
      formats:new Set(f.formats||[]),intents:new Set(f.intents||[]),family:family(a)
    };
  }
  function shared(a,b){for(const x of a)if(b.has(x))return true;return false;}
  function reasonFit(reason,a){
    const text=String(a.title||'')+' '+String(a.summary||'').slice(0,500);
    if(reason==='evidence')return EVIDENCE.test(text)?1:.45;
    if(reason==='reusable')return METHOD.test(text)?1:.45;
    if(reason==='consumer')return CONSUMER.test(text)?1:.3;
    if(reason==='work_direct')return WORK.test(text)?1:.45;
    if(reason==='japan_market')return /日本|国内|小売|EC|楽天|Amazon|市場/.test(text)?1:.5;
    if(reason==='ai_practical')return /(?:生成AI|ChatGPT|Claude|LLM).{0,45}(?:業務|運用|分析|活用|ワークフロー)/i.test(text)?1:.2;
    if(reason==='knowledge_delta')return /knowledge_gap|boundary_or_counterexample|rule_evidence/.test(String(a.knowledge_context?.increment_type||''))?1:.5;
    return 1;
  }
  function vector(a,cache){
    if(cache.has(a))return cache.get(a);
    const e=a.semantic_vector;
    if(!e?.q||Number(e.dim)!==384){cache.set(a,null);return null;}
    try{
      const raw=typeof atob==='function'?atob(e.q):Buffer.from(e.q,'base64').toString('latin1');
      if(raw.length!==384)throw new Error('invalid vector');
      const v=new Int8Array(384);let norm=0;
      for(let i=0;i<384;i++){const n=raw.charCodeAt(i);v[i]=n>127?n-256:n;norm+=v[i]*v[i];}
      const result={v,norm:Math.sqrt(norm)||1};cache.set(a,result);return result;
    }catch(_){cache.set(a,null);return null;}
  }
  function cosine(a,b){let dot=0;for(let i=0;i<384;i++)dot+=a.v[i]*b.v[i];return dot/(a.norm*b.norm);}
  function titlePieces(a){
    const title=String(a.title||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const out=new Set();for(let i=0;i<title.length-2;i++)out.add(title.slice(i,i+3));return out;
  }
  function lexicalSimilarity(a,b){
    const left=titlePieces(a),right=titlePieces(b);if(!left.size||!right.size)return 0;
    let matches=0;for(const part of left)if(right.has(part))matches++;
    return matches/Math.min(left.size,right.size);
  }
  function events(a,s){
    const out=[],bad=NEG.has(s.feedback)||s.status==='skip';
    if(!bad&&(s.status==='later'||Number(s.later_interest_at||0)>0||s.feedback_reason==='later_interest'))
      out.push({weight:1.0,label:'稍后看',at:Number(s.later_interest_at||s.status_updated_at||0)});
    if(!bad&&s.status==='save')out.push({weight:.48,label:'收藏',at:Number(s.status_updated_at||0)});
    if(!bad&&s.feedback==='more')out.push({weight:.82,label:s.feedback_reason||'希望多看',reason:s.feedback_reason||'',at:Number(s.feedback_reason_updated_at||0)});
    if(!bad&&s.feedback==='accurate')out.push({weight:.25,label:s.feedback_reason||'判断准确',reason:s.feedback_reason||'',at:Number(s.feedback_reason_updated_at||0)});
    // Reading to completion by itself says little about whether the article was good.
    if(NEG.has(s.feedback))out.push({weight:s.feedback==='less'?-1:-.75,
      label:s.feedback_reason||'明确负反馈',reason:s.feedback_reason||'',at:Number(s.feedback_reason_updated_at||0)});
    else if(s.status==='skip')out.push({weight:-.2,label:'跳过',reason:'skip',at:Number(s.status_updated_at||0)});
    return out.map(x=>({...x,article:a,at:x.at||Date.parse(a.first_seen||a.published||'')||0}));
  }
  function makeModel(rows,getState,now=Date.now()){
    const cache=new WeakMap(),samples=[];
    for(const a of rows){
      const s=getState(a)||{};
      for(const e of events(a,s)){
        const age=Math.max(0,(now-e.at)/DAY);
        // Old feedback remains part of history, but recent choices dominate.
        const ageFactor=age<90?1:age<180?.8:age<365?.6:age<730?.4:.25;
        samples.push({...e,weight:e.weight*ageFactor,context:dimensions(a),vec:vector(a,cache)});
      }
    }
    const scores=new WeakMap();
    function explain(a){
      if(scores.has(a))return scores.get(a);
      const context=dimensions(a),v=vector(a,cache),positives=[],negatives=[];
      for(const s of samples){
        if(s.article.id===a.id)continue;
        // Reject only the same format family. A disliked webinar never rejects
        // an AI workflow study, even when both use the same generic terms.
        if(s.weight<0&&s.context.family!==context.family)continue;
        const topic=shared(context.topics,s.context.topics);
        const samePresentation=shared(context.formats,s.context.formats)||shared(context.intents,s.context.intents);
        if(s.reason==='promo'&&context.family==='substance')continue;
        if(s.reason==='topic'&&!topic)continue;
        if(s.weight<0&&['no_evidence','too_generic'].includes(s.reason)&&
            a.priority_review?.verdict==='recommend')continue;
        const exactVector=!!(v&&s.vec);
        const sim=exactVector?cosine(v,s.vec):0;
        // Archived articles lose their vector at 90 days. Their exact topic,
        // presentation and title still provide a weak, conservative signal.
        const lexical=!exactVector&&topic&&samePresentation&&
          s.context.family===context.family?lexicalSimilarity(a,s.article):0;
        // E5 embeddings have a high baseline similarity even on unrelated
        // articles. Require unusually close meaning AND contextual agreement.
        if(exactVector&&(sim<.925||(!topic&&sim<.965)||
            (s.weight<0&&s.reason!=='topic'&&!samePresentation&&sim<.955)))continue;
        if(!exactVector&&lexical<.35)continue;
        const closeness=exactVector?clamp((sim-.91)/.075,0,1):clamp(lexical-.2,0,.35);
        const strength=s.weight*closeness*(topic?1:.6)*(samePresentation?1:.72)*
          (s.weight>0?reasonFit(s.reason,a):1);
        const match={id:s.article.id,title:s.article.title,reason:s.label,similarity:exactVector?sim:lexical,strength,method:exactVector?'semantic':'archived_title'};
        (strength<0?negatives:positives).push(match);
      }
      positives.sort((a,b)=>b.strength-a.strength);
      negatives.sort((a,b)=>a.strength-b.strength);
      const pos=positives.slice(0,3).reduce((n,x)=>n+x.strength,0);
      const neg=negatives.slice(0,3).reduce((n,x)=>n+x.strength,0);
      const delta=clamp(.48*pos+.85*neg,negatives.length===1?-.35:-1.65,.8);
      // Repeated strong, specifically matching negative evidence can keep an
      // otherwise relevant article out; a single sample only lowers its rank.
      const strong=negatives.filter(x=>x.strength<=-.65);
      const cap=strong.length>=2&&neg<-.9&&pos<.65?6.9:10;
      const result={delta,cap,positives:positives.slice(0,3),negatives:negatives.slice(0,3),sampleCount:samples.length};
      scores.set(a,result);return result;
    }
    return {explain,sampleCount:samples.length,positiveSamples:samples.filter(s=>s.weight>0).length,
      negativeSamples:samples.filter(s=>s.weight<0).length,
      archivedSamples:samples.filter(s=>!s.vec).length};
  }
  return {makeModel,family};
});
