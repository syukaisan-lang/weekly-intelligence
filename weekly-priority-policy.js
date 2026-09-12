// Shared, deterministic editorial gate. Source text only: generated reasons, source
// prestige and vector similarity cannot establish evidence or upgrade an article.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.weeklyPriorityPolicy=api;
})(typeof window==='object'?window:this,function(){
  const VERSION=37;
  const DOMAINS=[
    ['竞争分析',/競合分析|競合調査|競争分析|競合.{0,10}(比較|データ)/i,'对照竞品的价格、渠道和销售表现'],
    ['AI业务流程',/(?:AI|ChatGPT|Claude|Gemini|LLM).{0,45}(?:業務|ワークフロー|データ分析|販促|メルマガ|広告運用|市場調査)|(?:業務|販促|メルマガ).{0,45}(?:AI|ChatGPT|Claude|Gemini)/i,'改进数据分析或营销执行流程'],
    ['AI搜索与购买',/AI検索|AI推薦|AIO|AEO|生成AI.{0,30}(?:購買|購入|検索)|(?:EC流入|購買|購入).{0,30}(?:生成AI|ChatGPT)|検索.{0,12}AI/i,'评估AI搜索对获客和购买决策的影响'],
    ['消费者研究',/消費者|生活者|購買行動|顧客理解|インサイト|デプスインタビュー|商品探索|偶発購買|(?:購入|購買|ギフト|値上げ).{0,25}(?:調査|行動|重視|変える)|(?:調査|レビュー).{0,25}(?:購入|購買|価格|商品)/i,'检验消费者动机与转化假设'],
    ['广告与CRM',/広告効果|効果測定|広告運用|運用型広告|メルマガ|ブランドリフト|(?<![a-z])(?:ROAS|CPA|CVR|CRM|LTV|NPS)(?![a-z])/i,'改进投放、转化或客户留存判断'],
    ['EC运营',/(?<![a-z])EC(?![a-z])|eコマース|通販|Amazon|アマゾン|楽天|Shopify|D2C/i,'检验EC运营、渠道或转化决策'],
    ['品牌与GTM',/マーケティング|ブランド戦略|ブランディング|ポジショニング|市場創造|市場参入|市場開拓|顧客獲得|海外展開|ローカライズ|価格戦略|(?<![a-z])GTM(?![a-z])/i,'补充定位、市场进入或增长判断'],
    ['团队管理',/マーケ組織|マーケティング組織|マネジメント|チーム運営|1on1|カスタマーサクセス/i,'改进团队协作或客户经营判断']
  ];
  function clean(v){return String(v||'').normalize('NFKC').replace(/https?:\/\/\S+/g,'').replace(/The post .*?first appeared on.*$/i,'').replace(/\s+/g,' ').trim();}
  function sourceText(a){return {head:clean(a.title+' '+(a.summary||'')),body:clean(a.content_excerpt)};}
  function sentences(text){return text.split(/(?<=[。！？])|\n+/).map(x=>x.trim()).filter(x=>x.length>=24);}
  const EVENT=/オンラインセミナー|ウェビナー|参加募集|参加企業募集中|申込|申し込み|開催日時|参加費|本講演|今回の講演|紹介される予定|登壇決定/i;
  const RECAP=/開催レポート|講演レポート|イベントレポート|講演録|セミナーレポート|カンファレンスレポート/i;
  const PROMO=/提供開始|販売開始|発売|ローンチ|新発売|新機能|新フォーマット|発表|リリース|スタート|オープン|展開を拡充/i;
  const STUDY=/調査|分析|検証|研究|白書|レポート/i;
  const ROUNDUP=/アクセスランキング|ネッ担まとめ|編集後記|おすすめ.{0,6}[0-9]+選|企業[0-9]+選/i;
  const BASIC=/初心者|入門|基礎知識|とは[?？]|の定義と|MCP.{0,12}(始め方|設定方法)|プロンプト.{0,10}入門/i;
  const METRIC=/(?:売上|売り上げ|利益|収益|開封率|クリック率|転換率|購入率|購買|購入|成約|離脱|シェア|流入|広告費|制作時間|作業時間|CVR|ROAS|CPA|LTV|利用率|回答|検索|コスト)/i;
  const NUMBER=/\d+(?:\.\d+)?\s*(?:%|倍|割|万円|億円|兆円|ポイント)|[一二三四五六七八九]分の[一二三四五六七八九]/;
  const FUTURE=/予定|見込|目指|期待|最大.{0,8}(?:還元|OFF)|ポイント還元|割引クーポン/i;
  const METHOD=/比較|切り分け|検証|分解|分類|セグメント|仮説|集計|計測|指標|判断|分析|検討|テスト|設計/i;
  const OBJECT=/価格|競合|データ|売上|利益|顧客|購買|購入|広告|CVR|ROAS|CPA|チャネル|商品|検索|プロンプト|リピート|ブランド|メルマガ/i;
  const DETAIL=/手順|観点|方法|フレームワーク|実践|ケース|事例|戦略|ポイント|どう決め|比較|なぜ|何が|背景|見極め/i;
  // A source-bound content review may correct both false positives and false negatives.
  // Review evidence must be an exact excerpt from currently available source material.
  function sourceSignature(a){
    const text=[a.title||'',a.summary||'',a.content_excerpt||'',a.content_checked?'1':'0'].join('\u001f');
    let hash=2166136261;for(const char of text){hash=Math.imul(hash^char.codePointAt(0),16777619)>>>0;}
    return hash.toString(16).padStart(8,'0');
  }
  function reviewedAssessment(a){
    const r=a.priority_review;
    if(!r||!r.two_pass||r.version!==VERSION||r.source_signature!==sourceSignature(a))return null;
    if(!['recommend','brief','skip','uncertain'].includes(r.verdict))return null;
    const available=clean((a.summary||'')+' '+(a.content_excerpt||''));
    const evidence=(r.evidence||[]).filter(x=>typeof x==='string'&&clean(x).length>=12&&available.includes(clean(x)));
    if(r.verdict!=='uncertain'&&!evidence.length)return null;
    if(r.verdict==='recommend'&&(!r.use||!r.gain||r.confidence==='low'))return null;
    const eligible=r.verdict==='recommend';
    return {version:VERSION,eligible,score:eligible?8.3:r.verdict==='skip'?5.3:5.8,cap:eligible?8.6:6.9,
      decision:{recommend:'值得阅读',brief:'摘要足够',skip:'跳过',uncertain:'待核验'}[r.verdict],
      reason:r.gain||r.reason,domain:r.domain||'',use:r.use||'',evidence,kind:r.kind||'review',
      confidence:r.confidence||'low',reviewed:true};
  }
  const cache=new WeakMap();
  function assess(a){
    const inputs=[a.title,a.summary,a.content_excerpt,a.content_checked,a.content_completeness,a.priority_review];
    const hit=cache.get(a);
    if(hit&&inputs.every((v,i)=>v===hit.inputs[i]))return hit.result;
    const result=reviewedAssessment(a)||assessSource(a);cache.set(a,{inputs,result});return result;
  }
  function assessSource(a){
    const {head,body}=sourceText(a),title=clean(a.title),lead=body.slice(0,900);
    const out={version:VERSION,eligible:false,score:5.8,cap:6.9,decision:'摘要足够',reason:'尚未确认值得阅读全文的新增内容',domain:'',use:'',evidence:[],kind:'brief',confidence:'low'};
    function reject(decision,reason,cap=6.9){return {...out,decision,reason,score:Math.min(out.score,cap),cap};}
    // Event promises remain announcements even if they promise strategy, data or case studies.
    if((EVENT.test(head+' '+lead)&&!RECAP.test(title))||((body.match(/本講演|今回の講演|参加費|開催日時/g)||[]).length>=2))return reject('跳过','活动报名或预告，方法与结果尚未在本文交付',5.3);
    if(ROUNDUP.test(title))return reject('摘要足够','合集或排行榜，避免重复占用优先阅读名额');
    if(/新CM|CM出演|CM公開|CM放映|CMに.{0,20}起用|記念広告|ブランドムービー/.test(title)&&!STUDY.test(title))return reject('跳过','创意或广告发布消息，未提供效果验证',5.3);
    const domain=DOMAINS.find(([,re])=>re.test(head));
    if(!domain)return reject('待核验','关键词未命中不能证明无关，等待内容复核');
    [out.domain,,out.use]=domain;
    if(BASIC.test(title)&&!STUDY.test(title))return reject('摘要足够','基础定义或入门内容，未确认进阶增量');
    const bodyLength=body.replace(/\s/g,'').length;
    if(!a.content_checked||bodyLength<160)return reject('待核验','正文不足，不能凭标题、摘要或相关度认定值得精读');
    const rows=sentences(body);
    const results=rows.filter(s=>METRIC.test(s)&&NUMBER.test(s)&&!FUTURE.test(s)&&!EVENT.test(s));
    const methods=rows.filter(s=>METHOD.test(s)&&OBJECT.test(s)&&s.length>=45&&!EVENT.test(s)&&!FUTURE.test(s));
    const isStudy=STUDY.test(title)||STUDY.test(head.slice(0,250));
    const methodArticle=DETAIL.test(title)&&methods.length>=2;
    const measuredCase=results.length>=1&&methods.length>=2&&(/事例|実現|改革|改善|戦略|成長|成果/.test(title));
    if(PROMO.test(title)&&!/調査結果|実態調査|調査レポート/.test(title)&&!measuredCase)return reject('摘要足够','产品、服务或渠道发布，缺少可迁移的实施过程与验证');
    // A short survey bulletin may be useful, but a summary normally carries its value.
    if(!methodArticle&&!measuredCase&&!(isStudy&&results.length>=1))return reject('待核验','规则尚不能确认阅读价值，等待内容复核；不能据此判定不值得读');
    out.kind=measuredCase?'case':methodArticle?'method':'research';
    out.evidence=[...new Set([...results.slice(0,1),...methods.slice(0,2),...results])].slice(0,2).map(s=>s.slice(0,220));
    if(out.evidence.length<1)return reject('待核验','缺少可核对的正文依据');
    out.confidence=a.content_completeness==='full'?'high':'medium';
    out.score=out.kind==='case'?8.8:out.kind==='method'?8.3:7.6;
    // Partial bodies can qualify on observed evidence, but cannot receive S from a presumed full read.
    out.cap=out.confidence==='high'?9.2:8.6;
    out.score=Math.min(out.score,out.cap);
    out.eligible=true;out.decision='值得精读';
    out.reason=out.kind==='case'?'正文同时包含实施细节与量化结果':out.kind==='method'?'正文提供可复用的分析步骤或决策方法':'正文包含多项研究结果及分析，可用于检验业务假设';
    return out;
  }
  function titleTokens(a){const t=clean(a.title).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');return new Set(Array.from({length:Math.max(0,t.length-2)},(_,i)=>t.slice(i,i+3)));}
  function sameStory(a,b){
    if(a.url===b.url&&a.url)return true;
    const x=clean(a.content_excerpt),y=clean(b.content_excerpt);
    return x.length>=160&&x===y;
  }
  function select(rows,{assessment=assess,value=a=>assessment(a).score,minutes=()=>4,budget=0}={}){
    const ranked=rows.filter(a=>assessment(a).eligible).slice().sort((a,b)=>value(b)-value(a)||String(a.id).localeCompare(String(b.id)));
    const selected=[];let used=0;
    for(const a of ranked){
      if(selected.some(b=>sameStory(a,b)))continue;
      const m=minutes(a);if(budget&&used+m>budget)continue;
      selected.push(a);used+=m;
    }
    return selected;
  }
  return {VERSION,assess,select,sameStory,sourceText,sourceSignature};
});
