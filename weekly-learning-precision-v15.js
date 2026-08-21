// Precision learning v15
// Negative feedback transfers only when subject AND context (format/intent) match.
// This prevents "I dislike an AI webinar" from becoming "I dislike AI".
(() => {
  const SUBJECT_RULES=[
    ['AI工作流',/AIエージェント|AI.?agent|生成AI.*(業務|活用|運用|ワークフロー)|Claude|ChatGPT|LLM|skill|スキル/i],
    ['EC平台运营',/Amazon|楽天|Yahoo!?ショッピング|ECモール|マーケットプレイス|eコマース|EC運営|D2C/i],
    ['消费者研究',/消費者|生活者|購買行動|ユーザー調査|インサイト|アンケート|顧客理解|VOC/i],
    ['品牌策略',/ブランド|ブランディング|ポジショニング|ブランド戦略/i],
    ['广告投放',/広告|ROAS|CPA|運用型広告|DSP|P.?MAX|リスティング/i],
    ['零售/渠道',/小売|リテール|店舗|流通|チャネル|コンビニ|ドラッグストア/i],
    ['价格/促销',/価格|値上げ|値下げ|セール|割引|クーポン|販促/i],
    ['CRM/CX',/CRM|CX|NPS|LTV|ロイヤルティ|リテンション/i],
    ['GTM/市场进入',/GTM|市場参入|市場開拓|Go.?to.?Market|海外展開/i],
    ['组织/营销管理',/CMO|マーケ組織|組織改革|KPI|マーケター|マネジメント/i],
    ['产品/新品',/新製品|新商品|新サービス|発売|製品発表/i],
    ['娱乐/赛事',/ゲーム|アイドル|アニメ|TGS|東京ゲームショウ|芸能|スポーツ/i],
    ['旅游/观光',/観光|旅行|インバウンド|ホテル|宿泊|ツーリズム/i],
    ['招聘/职场',/採用|転職|人材|キャリア|働き方|人事/i]
  ];
  const EVENT_RE=/オンラインセミナー|ウェビナー|セミナー|イベント|カンファレンス|参加募集|申込|登壇|開催/i;
  const PROMO_RE=/新製品|新商品|新サービス|発売|予約開始|提供開始|キャンペーン|プレゼント|セール/i;
  const METHOD_RE=/調査|分析|データ|統計|実証|実験|ケース|事例|フレームワーク|手法|方法|検証|改善/i;

  function text(a){return `${a?.title||''} ${a?.summary||''} ${a?.reason||''}`;}
  function uniq(xs){return [...new Set(xs.filter(Boolean))];}
  function subjects(a){
    const t=text(a),specific=SUBJECT_RULES.filter(([,re])=>re.test(t)).map(([n])=>n);
    return uniq(specific);
  }
  function fingerprint(a){
    const f=typeof typedFeatures==='function'?typedFeatures(a):{formats:[],intents:[],signals:[]};
    return {subjects:subjects(a),formats:uniq(f.formats||[]),intents:uniq(f.intents||[]),signals:uniq(f.signals||[]),raw:text(a)};
  }
  function overlap(a,b){if(!a.length||!b.length)return 0;const bs=new Set(b);return a.filter(x=>bs.has(x)).length/Math.max(a.length,b.length);}
  function sameContext(a,b){return Math.max(overlap(a.formats,b.formats),overlap(a.intents,b.intents));}
  function isContextHeavy(fp){return EVENT_RE.test(fp.raw)||PROMO_RE.test(fp.raw)||fp.intents.some(x=>/告知|募集|販促|リード獲得/.test(x));}
  function articleAgeDays(a){const ms=Date.parse(a?.first_seen||a?.published||'');return Number.isFinite(ms)?(Date.now()-ms)/86400000:0;}

  let sampleCache=null;
  function rebuildSamples(){
    sampleCache=[];
    for(const a of data?.articles||[]){
      const fb=typeof st==='function'?st(a.id).feedback:null;
      if(!fb||articleAgeDays(a)>84)continue;
      const fp=fingerprint(a);
      if(!fp.subjects.length)continue; // never generalize a vague negative signal
      sampleCache.push({id:String(a.id),fb,fp});
    }
  }
  function samples(){if(!sampleCache)rebuildSamples();return sampleCache;}

  function preciseDelta(a){
    const target=fingerprint(a);if(!target.subjects.length)return 0;
    const pos=[],neg=[];
    for(const s of samples()){
      if(s.id===String(a.id))continue;
      const subj=overlap(target.subjects,s.fp.subjects);if(!subj)continue;
      const ctx=sameContext(target,s.fp);
      const sourceHeavy=isContextHeavy(s.fp),targetHeavy=isContextHeavy(target);
      let v=0;
      if(s.fb==='more')v=.22*subj*(.75+.55*ctx);
      else if(s.fb==='accurate')v=.07*subj*(.8+.35*ctx);
      else if(s.fb==='bad'||s.fb==='less'){
        // Context-heavy rejection transfers only to the same kind of context.
        if(sourceHeavy&&(!targetHeavy||ctx===0))continue;
        // When the rejected article had an explicit format/intent, require contextual overlap.
        if((s.fp.formats.length||s.fp.intents.length)&&ctx===0)continue;
        const base=s.fb==='less'?-.48:-.22;
        v=base*subj*(.65+.55*ctx);
      }
      if(v>0)pos.push(v);else if(v<0)neg.push(v);
    }
    pos.sort((a,b)=>b-a);neg.sort((a,b)=>a-b);
    return Math.max(-.85,Math.min(.58,pos.slice(0,3).reduce((s,x)=>s+x,0)+neg.slice(0,3).reduce((s,x)=>s+x,0)));
  }

  // Small structural penalty for pure event/promo notices with no evidence/method content.
  // It targets the presentation intent, not the underlying subject.
  function lowValueContextPenalty(a){
    const t=text(a),event=EVENT_RE.test(t),promo=PROMO_RE.test(t),method=METHOD_RE.test(t);
    if(method)return 0;
    if(event)return -.42;
    if(promo)return -.24;
    return 0;
  }

  if(typeof score==='function'){
    const previousScore=score;
    score=function(a){
      const base=previousScore(a);
      return Math.max(0,Math.min(10,base+preciseDelta(a)+lowValueContextPenalty(a)));
    };
  }

  // Invalidate precision samples before any feedback-driven render.
  if(typeof feedback==='function'){
    const previousFeedback=feedback;
    feedback=function(a,v){sampleCache=null;return previousFeedback(a,v);};
  }
  document.getElementById('resetLearning')?.addEventListener('click',()=>{sampleCache=null;},{capture:true});

  // Explain the new attribution model in the learned-preferences panel.
  if(typeof renderPrefs==='function'){
    const previousRenderPrefs=renderPrefs;
    renderPrefs=function(){
      previousRenderPrefs();
      const root=document.getElementById('learnedPrefs');if(!root)return;
      const note=document.createElement('div');note.className='muted small precision-learning-note';
      note.textContent='精准学习 v15：负反馈按“具体主题 × 内容形式 × 意图”组合归因；活动/PR 的负反馈不会扩散到同主题的实操、数据或方法论内容。';
      root.appendChild(note);
    };
  }

  window.weeklyLearningPrecisionV15={fingerprint,preciseDelta,lowValueContextPenalty,rebuildSamples};
})();
