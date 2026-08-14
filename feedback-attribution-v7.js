// Feedback attribution v7: learn WHAT was rejected separately from HOW it was studied.
(() => {
  window.weeklyFeedbackAttributionVersion='subject-method-v7';
  const method=/調査|研究|分析|データ|統計|実証|実験|アンケート|フレームワーク|方法|手法|research|survey/i;
  const subjects=[
    ['旅游/观光',/観光|旅行|ツーリズム|旅館|ホテル|宿泊|インバウンド|旅行者/i],
    ['食品/餐饮',/食品|飲食|外食|レストラン|カフェ|菓子|スイーツ|飲料/i],
    ['家电/数码',/家電|スマホ|イヤホン|ヘッドホン|オーディオ|PC|ガジェット/i],
    ['汽车/出行',/自動車|EV|モビリティ|カーシェア|タクシー/i],
    ['住宅/不动产',/住宅|不動産|マンション|戸建|賃貸|住まい/i],
    ['金融/支付',/金融|銀行|証券|保険|投資|決済|キャッシュレス/i],
    ['医疗/健康',/医療|健康|ヘルスケア|病院|介護|高齢者/i],
    ['招聘/职场',/採用|転職|人材|就職|キャリア|働き方|人事/i]
  ];
  const oldTyped=typedFeatures;
  typedFeatures=function(a){
    const f=oldTyped(a),text=textOf(a),extra=subjects.filter(([,re])=>re.test(text)).map(([n])=>n);
    f.topics=[...new Set([...(f.topics||[]).filter(x=>!method.test(String(x))),...extra])];
    f.subjects=f.topics;
    return f;
  };
  applyFeedback=function(a,feedback){
    const f=typedFeatures(a),contextHeavy=isContextDominant(f),strong=feedback==='less';
    if(feedback==='accurate'){
      f.topics.forEach(x=>add(prefs.topics,x,.045));f.formats.forEach(x=>add(prefs.formats,x,.02));f.intents.forEach(x=>add(prefs.intents,x,.02));f.signals.forEach(x=>add(prefs.signals,x,.03));
    }else if(feedback==='more'){
      f.topics.forEach(x=>add(prefs.topics,x,.16));f.formats.forEach(x=>add(prefs.formats,x,.06));f.intents.forEach(x=>add(prefs.intents,x,.07));f.signals.forEach(x=>add(prefs.signals,x,.10));
    }else if(feedback==='bad'||feedback==='less'){
      if(contextHeavy){
        f.formats.forEach(x=>add(prefs.formats,x,strong?-.46:-.18));f.intents.forEach(x=>add(prefs.intents,x,strong?-.58:-.24));f.signals.forEach(x=>add(prefs.signals,x,strong?-.34:-.16));
      }else{
        f.topics.forEach(x=>add(prefs.topics,x,strong?-.14:-.06));
      }
    }
  };
  window.weeklyFeedbackSubjectsV7=a=>typedFeatures(a).subjects||typedFeatures(a).topics||[];
})();
