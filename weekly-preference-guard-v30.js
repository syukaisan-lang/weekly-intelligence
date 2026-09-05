// Weekly v30: persistent negative preference learning + hard guards for repeatedly rejected low-value formats.
// Goal: when the user says "主题不感兴趣" or repeatedly rejects a format, stop resurfacing it in S/A and Priority Reading.
(() => {
  const DAY=86400000;
  const MAX_AGE=365;
  const NEGATIVE=new Set(['bad','less']);
  const GENERIC=new Set(['AI','生成AI','EC','eコマース','市場','调研','調査','データ','広告','ブランド','消費者','顧客','ユーザー','マーケティング','コンテンツ']);

  // Explicit standing preferences from the user. These are format/topic guards, not broad bans on
  // useful marketing knowledge. Substantive analysis/data/method articles are deliberately exempted.
  const EVENT_RE=/オンラインセミナー|ウェビナー|セミナー|カンファレンス|フォーラム|シンポジウム|イベント|説明会|発表会|講演|登壇|参加募集|申込|開催案内|会議開催/i;
  const PROMO_RE=/キャンペーン|プレゼント|販促|プロモーション|PR企画|記念企画|コラボ企画|キャンペーン開始|キャンペーン実施|告知|発売記念/i;
  const CM_RE=/テレビCM|TVCM|新CM|CM放映|CM出演|CMキャラクター|CM公開|広告クリエイティブ|ブランドムービー|広告ムービー|動画広告|OOH|交通広告/i;
  const SUBSTANTIVE_RE=/調査|データ|統計|実証|実験|分析|効果測定|検証|事例|ケース|購買|消費者|顧客|売上|CVR|ROAS|CPA|成果|比較|戦略|手法|方法|フレームワーク|運用|改善|インサイト/i;
  const AD_ANALYSIS_RE=/ROAS|CPA|CVR|効果測定|広告効果|ブランドリフト|購買|売上|調査|データ|分析|戦略|メディアプラン|運用型広告|ABテスト|A\/Bテスト/i;

  const FAMILY_LABELS={event:'会议/活动告知',promo:'宣传/促销',cm:'广告CM/创意报道'};
  const FAMILY_CAP={event:5.25,promo:5.15,cm:5.25};
  const EXTRA_SUBJECT_RULES=[
    ['广告CM/创意报道',CM_RE],
    ['会议/活动',EVENT_RE],
    ['宣传/促销',PROMO_RE],
    ['娱乐/赛事',/ゲーム|アイドル|アニメ|芸能|スポーツ|大会|リーグ/i],
    ['旅游/观光',/観光|旅行|インバウンド|ホテル|宿泊|ツーリズム/i],
    ['产品发布',/新製品|新商品|新サービス|発売|予約開始|提供開始|製品発表/i]
  ];

  let profileCache=null;
  let scoreCache=new Map();
  let revision=0;

  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function text(a){return `${a?.title||''} ${a?.summary||''} ${a?.reason||''} ${(a?.content_excerpt||'').slice(0,1200)}`;}
  function uniq(xs){return [...new Set((xs||[]).filter(Boolean))];}
  function ageWeight(ts){
    if(!ts)return .7;
    const age=Math.max(0,(Date.now()-ts)/DAY);
    if(age<=90)return 1;
    if(age<=180)return .88;
    if(age<=MAX_AGE)return .72;
    return 0;
  }
  function fpSubjects(a){
    const out=[];
    try{out.push(...(window.weeklyLearningPrecisionV15?.fingerprint?.(a)?.subjects||[]));}catch(_){}
    try{
      const f=typeof typedFeatures==='function'?typedFeatures(a):null;
      for(const x of f?.topics||[]){const k=String(x||'').trim();if(k&&!GENERIC.has(k)&&k.length<=40)out.push(k);}
    }catch(_){}
    const t=text(a);for(const [name,re] of EXTRA_SUBJECT_RULES)if(re.test(t))out.push(name);
    return uniq(out).slice(0,12);
  }
  function families(a){
    const t=text(a),out=[];
    const substantive=SUBSTANTIVE_RE.test(t);
    if(EVENT_RE.test(t)&&!substantive)out.push('event');
    if(PROMO_RE.test(t)&&!substantive)out.push('promo');
    if(CM_RE.test(t)&&!AD_ANALYSIS_RE.test(t))out.push('cm');
    return out;
  }
  function ownLater(a){const s=hs(a);return s.status==='later'||s.feedback_reason==='later_interest'||Number(s.later_interest_at||0)>0;}

  function entry(map,key){if(!map[key])map[key]={neg:0,pos:0,lastNeg:0,lastPos:0};return map[key];}
  function buildProfile(){
    const subject={},family={};
    for(const a of data?.articles||[]){
      const s=hs(a),fb=s.feedback,reason=s.feedback_reason;
      const nts=Number(s.feedback_reason_updated_at||s.status_updated_at||s.updated_at||0)||Date.parse(a?.first_seen||a?.published||'')||0;
      const w=ageWeight(nts);if(!w)continue;

      // "主题不感兴趣" is a persistent subject-level instruction, not a tiny one-article penalty.
      if(reason==='topic'&&NEGATIVE.has(fb)){
        const base=fb==='less'?1.55:1.05;
        for(const k of fpSubjects(a)){const e=entry(subject,k);e.neg+=base*w;e.lastNeg=Math.max(e.lastNeg,nts);}
      }
      // "活动/宣传" teaches the exact rejected format family too.
      if(reason==='promo'&&NEGATIVE.has(fb)){
        const base=fb==='less'?1.7:1.2;
        for(const k of families(a)){const e=entry(family,k);e.neg+=base*w;e.lastNeg=Math.max(e.lastNeg,nts);}
      }

      // Later is still the strongest positive behavior. A later action AFTER a negative signal
      // can reopen that exact subject instead of freezing the user forever.
      if(s.status==='later'||s.feedback_reason==='later_interest'||Number(s.later_interest_at||0)>0){
        const pts=Number(s.later_interest_at||s.feedback_reason_updated_at||s.status_updated_at||s.updated_at||0)||nts;
        const pw=ageWeight(pts)*1.85;
        for(const k of fpSubjects(a)){const e=entry(subject,k);e.pos+=pw;e.lastPos=Math.max(e.lastPos,pts);}
        for(const k of families(a)){const e=entry(family,k);e.pos+=pw;e.lastPos=Math.max(e.lastPos,pts);}
      }
    }
    profileCache={subject,family};return profileCache;
  }
  function profile(){return profileCache||buildProfile();}

  function learnedSuppression(a){
    if(ownLater(a))return {penalty:0,cap:10,keys:[]};
    const p=profile(),keys=fpSubjects(a),matched=[];let strength=0,hard=0;
    for(const k of keys){
      const e=p.subject[k];if(!e)continue;
      // A newer Later action is allowed to overturn an older negative topic instruction.
      const effective=e.lastPos>e.lastNeg?Math.max(0,e.neg-e.pos):Math.max(0,e.neg-.55*e.pos);
      if(effective<=.25)continue;
      matched.push(k);strength+=effective;if(effective>=1.0)hard++;
    }
    const fam=families(a);
    for(const k of fam){
      const e=p.family[k];if(!e)continue;
      const effective=e.lastPos>e.lastNeg?Math.max(0,e.neg-e.pos):Math.max(0,e.neg-.55*e.pos);
      if(effective<=.25)continue;
      matched.push(FAMILY_LABELS[k]);strength+=effective;if(effective>=1.0)hard++;
    }
    let cap=10;
    if(hard>=2||strength>=2.5)cap=5.35;       // repeated rejection -> C / hidden from queue
    else if(hard>=1||strength>=1.05)cap=6.85; // one clear topic-level rejection -> never S/A
    const penalty=-Math.min(2.2,.58*strength);
    return {penalty,cap,keys:uniq(matched)};
  }
  function declaredGuard(a){
    if(ownLater(a))return {cap:10,families:[]};
    const fam=families(a);let cap=10;
    for(const k of fam)cap=Math.min(cap,FAMILY_CAP[k]||10);
    return {cap,families:fam};
  }

  const previousScore=typeof score==='function'?score:null;
  if(previousScore){
    score=function(a){
      const key=String(a?.id||a?.url||a?.title||''),hit=key?scoreCache.get(key):null;
      if(hit&&hit.rev===revision)return hit.value;
      const base=Number(previousScore(a))||Number(a?.reading_score??5)||5;
      const learned=learnedSuppression(a),declared=declaredGuard(a);
      const value=Math.max(0,Math.min(10,Math.min(base+learned.penalty,learned.cap,declared.cap)));
      if(key)scoreCache.set(key,{rev:revision,value});return value;
    };
  }

  function invalidate(){revision++;scoreCache.clear();profileCache=null;try{window.weeklyPerformanceV28?.invalidate?.();}catch(_){};try{window.weeklyReadingTimeV21?.invalidate?.();}catch(_){};}
  if(typeof save==='function'){
    const prevSave=save;
    save=function(){invalidate();return prevSave();};
  }
  document.getElementById('resetLearning')?.addEventListener('click',invalidate,{capture:true});

  function suppressedTopics(){
    const p=profile(),rows=[];
    for(const [k,e] of Object.entries(p.subject)){
      const effective=e.lastPos>e.lastNeg?Math.max(0,e.neg-e.pos):Math.max(0,e.neg-.55*e.pos);
      if(effective>=1.0)rows.push([k,effective]);
    }
    return rows.sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
  }
  if(typeof renderPrefs==='function'){
    const prev=renderPrefs;
    renderPrefs=function(){
      prev();const root=document.getElementById('learnedPrefs');if(!root)return;
      const topics=suppressedTopics();
      const box=document.createElement('div');box.className='muted small precision-learning-note preference-guard-note';
      box.textContent=`强过滤：会议/活动告知、宣传/促销、广告CM/创意报道默认不进入 S/A${topics.length?`；已学习“不感兴趣”主题：${topics.join(' / ')}`:''}。只有你之后主动放入稍后看，才会重新放宽对应主题。`;
      root.appendChild(box);
    };
  }

  // Recalculate visible queue/focus counts once the final score guard is installed.
  function sync(){try{renderPrefs?.();}catch(_){};try{updateProgressTabs?.();}catch(_){};try{window.weeklyQueueClarityV29?.sync?.();}catch(_){};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(sync,40));else setTimeout(sync,40);
  window.weeklyPreferenceGuardV30={invalidate,profile,learnedSuppression,declaredGuard,families,subjects:fpSubjects};
})();
