// v17.2: lightweight focus queue + value-specific positive/negative feedback reasons.
(() => {
  const VIEW_KEY='weekly_intelligence_view_v2';
  const POS_REASONS=[
    ['evidence','📊 有可靠数据/调查'],['novelty','🧠 有新洞察'],['work_direct','🛠 能直接用于工作'],
    ['reusable','📐 方法可复用'],['consumer','👥 消费者行为有价值'],['japan_market','🇯🇵 日本市场有价值'],
    ['ai_practical','🤖 AI实际应用有价值'],['knowledge_delta','🔄 补充/挑战已有知识']
  ];
  const NEG_REASONS=[
    ['too_generic','太泛'],['promo','活动/宣传'],['not_work','和工作无关'],
    ['known','已经知道'],['no_evidence','缺数据/案例'],['topic','主题不感兴趣']
  ];
  const NEG_WEIGHTS={too_generic:-.18,promo:-.30,not_work:-.34,known:-.12,no_evidence:-.20,topic:-.26};
  const scoreCache=new Map();let reasonProfileCache=null;
  function text(a){return `${a?.title||''} ${a?.summary||''} ${a?.reason||''} ${(a?.content_excerpt||'').slice(0,900)}`;}
  function safeScore(a){const id=String(a?.id||'');if(scoreCache.has(id))return scoreCache.get(id);let s=5;try{s=Number(score(a))||5;}catch(_){s=Number(a?.reading_score??5)||5;}scoreCache.set(id,s);return s;}
  function safeGrade(a){try{return grade(safeScore(a));}catch(_){return a?.grade||'C';}}
  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function isQueue(a){const s=hs(a),g=safeGrade(a),ts=Date.parse(a?.first_seen||a?.published||'');if(!['S','A','B'].includes(g)||s.feedback||['later','read','save','skip'].includes(s.status))return false;if(Number.isFinite(ts)&&Date.now()-ts>=7*86400000)return false;return true;}
  function focusValue(a){const kc=a?.knowledge_context||{};let v=safeScore(a),inc=kc.increment_type||'';if(safeGrade(a)==='S')v+=1.15;if(inc==='direct_work_use')v+=.55;if(inc==='knowledge_gap')v+=.48;if(inc==='rule_evidence')v+=.42;if(inc==='boundary_or_counterexample')v+=.45;if(inc==='mostly_duplicate')v-=.62;v+=Math.min(.36,Number(kc.evidence_bonus||0)*.35+Number(kc.boundary_bonus||0)*.25);return v;}
  function focusLimit(rows){const strong=rows.filter(a=>safeGrade(a)==='S'||safeScore(a)>=7.8).length;return Math.max(15,Math.min(30,Math.max(18,strong+8)));}
  function focusRows(){const rows=(data?.articles||[]).filter(isQueue).sort((a,b)=>focusValue(b)-focusValue(a));return rows.slice(0,focusLimit(rows));}
  function focusIds(){return new Set(focusRows().map(a=>String(a.id)));}
  if(typeof visible==='function'){const prevVisible=visible;visible=function(a){if(typeof readingProgress==='undefined'||readingProgress!=='focus')return prevVisible(a);const old=readingProgress;try{readingProgress='unread';return prevVisible(a)&&focusIds().has(String(a.id));}finally{readingProgress=old;}};}
  function ensureFocusTab(){const seg=document.querySelector('.segmented');if(!seg||seg.querySelector('[data-progress="focus"]'))return;const b=document.createElement('button');b.className='segment-btn';b.type='button';b.dataset.progress='focus';b.innerHTML='优先阅读 <span class="segment-count">0</span>';seg.prepend(b);b.addEventListener('click',()=>setProgress?.('focus'));}
  function updateFocusTab(){ensureFocusTab();const el=document.querySelector('[data-progress="focus"] .segment-count');if(el)el.textContent=String(focusRows().length);document.querySelectorAll('[data-progress]').forEach(x=>x.classList.toggle('active',x.dataset.progress===readingProgress));}
  function reasonAffinity(a,key){const t=text(a),kc=a?.knowledge_context||{},inc=kc.increment_type||'';
    if(key==='work_direct')return inc==='direct_work_use'||/GTM|EC|Amazon|楽天|広告|市場|マーケ|顧客|CRM|CVR|価格|競合|販売/i.test(t)?1:0;
    if(key==='evidence')return /調査|データ|統計|実証|実験|アンケート|ケース|事例|前年比|％|%|サンプル|n=/i.test(t)?1:0;
    if(key==='reusable')return /方法|手法|フレームワーク|プロセス|運用|改善|検証|ノウハウ|how.?to|設計|分析/i.test(t)?1:0;
    if(key==='consumer')return /消費者|生活者|購買|購入|顧客|ユーザー|行動|認知|意思決定|セグメント/i.test(t)?1:0;
    if(key==='japan_market')return /日本|国内|市場|小売|リテール|EC|楽天|Amazon|企業|ブランド/i.test(t)?1:0;
    if(key==='novelty')return ['knowledge_gap','boundary_or_counterexample','rule_evidence'].includes(inc)||/新た|初|反例|意外|変化|転換|盲点|示唆/i.test(t)?1:0;
    if(key==='ai_practical')return /Claude|ChatGPT|生成AI|AIエージェント|AI.?agent|LLM/i.test(t)&&/活用|業務|運用|実装|ワークフロー|スキル|skill|自動化|分析/i.test(t)?1:0;
    if(key==='knowledge_delta')return ['knowledge_gap','boundary_or_counterexample','rule_evidence'].includes(inc)?1:(inc==='mostly_duplicate'?0:.15);
    if(key==='too_generic')return !/調査|データ|事例|方法|手法|実証|具体|数字|％|%/i.test(t)?1:0;
    if(key==='promo')return /セミナー|ウェビナー|イベント|開催|登壇|申込|キャンペーン|発売|提供開始|PR/i.test(t)?1:0;
    if(key==='not_work')return /芸能|アイドル|ゲーム|スポーツ|旅行|観光|グルメ/i.test(t)?1:.2;
    if(key==='known')return inc==='mostly_duplicate'?1:.15;
    if(key==='no_evidence')return !/調査|データ|統計|実証|実験|事例|ケース|％|%/i.test(t)?1:0;return 0;}
  function buildReasonProfile(){const counts={};for(const a of data?.articles||[]){const s=hs(a),r=s.feedback_reason,fb=s.feedback;if(!r||!fb)continue;const ts=Number(s.feedback_reason_updated_at||s.status_updated_at||0)||Date.parse(a?.first_seen||a?.published||'')||0;if(ts&&Date.now()-ts>84*86400000)continue;const sign=fb==='more'?1:(fb==='accurate'?.55:(fb==='less'?-1:(fb==='bad'?-.55:0)));counts[r]=(counts[r]||0)+sign;}reasonProfileCache=counts;return counts;}
  function learnedReasonDelta(a){const p=reasonProfileCache||buildReasonProfile();let d=0;for(const [k,w] of Object.entries(p)){if(!w)continue;const affinity=reasonAffinity(a,k);if(!affinity)continue;d+=Math.max(-.22,Math.min(.18,w*.045))*affinity;}return Math.max(-.48,Math.min(.42,d));}
  function ownReasonAdjustment(a){const s=hs(a);return NEG_WEIGHTS[s.feedback_reason]||0;}
  if(typeof score==='function'){const prevScore=score;score=function(a){return Math.max(0,Math.min(10,prevScore(a)+learnedReasonDelta(a)+ownReasonAdjustment(a)));};}
  function articleFromCard(card){const link=card.querySelector('.article-title');if(!link)return null;const href=link.getAttribute('href'),title=link.textContent.trim();return (data?.articles||[]).find(a=>a.url===href||a.title===title)||null;}
  function findCard(a){return [...document.querySelectorAll('#articleList .article')].find(c=>articleFromCard(c)?.id===a.id)||null;}
  function persistReason(a,key){const raw=state?.[a.id]||{};if(key)raw.feedback_reason=key;else delete raw.feedback_reason;raw.feedback_reason_updated_at=Date.now();state[a.id]=raw;save();scoreCache.clear();reasonProfileCache=null;}
  let commitFeedback=null;
  function openReasonPicker(a,v){const positive=['accurate','more'].includes(v),reasons=positive?POS_REASONS:NEG_REASONS;const card=findCard(a);if(!card){commitFeedback?.(a,v);return;}card.querySelector('.feedback-reasons')?.remove();const box=document.createElement('div');box.className='feedback-reasons';box.innerHTML=`<span class="feedback-reason-label">${positive?'为什么值得推？':'为什么不要？'}</span>${reasons.map(([k,t])=>`<button type="button" data-reason="${k}" class="reason-chip">${t}</button>`).join('')}<button type="button" data-reason="" class="reason-chip reason-skip">不选原因</button>`;card.querySelector('.controls')?.appendChild(box);requestAnimationFrame(()=>box.classList.add('show'));box.querySelectorAll('[data-reason]').forEach(btn=>btn.addEventListener('click',()=>{persistReason(a,btn.dataset.reason||null);box.querySelectorAll('.reason-chip').forEach(x=>x.classList.toggle('active',x===btn));box.classList.add('committing');setTimeout(()=>commitFeedback?.(a,v),90);},{once:true}));}
  if(typeof feedback==='function'){commitFeedback=feedback;feedback=function(a,v){const current=hs(a).feedback;if(['accurate','more','bad','less'].includes(v)&&current!==v){openReasonPicker(a,v);return;}return commitFeedback(a,v);};}
  if(typeof renderArticles==='function'){const prevRender=renderArticles;renderArticles=function(){scoreCache.clear();prevRender();updateFocusTab();const hint=document.getElementById('weeklyAttentionHint');if(readingProgress==='focus'&&hint)hint.textContent=`优先阅读：从当前 S/A/B 队列中按个人分、工作直接性、知识增量与重复度选出 ${focusRows().length} 篇。价值原因与负反馈原因共同参与后续排序。`;};}
  try{const saved=JSON.parse(localStorage.getItem(VIEW_KEY)||'{}')||{};if(saved.progress==='focus'&&typeof readingProgress!=='undefined')readingProgress='focus';else if(!saved.progress&&typeof readingProgress!=='undefined')readingProgress='focus';}catch(_){}
  ensureFocusTab();updateFocusTab();window.weeklyFocusFeedbackV17={focusRows,focusValue,learnedReasonDelta,updateFocusTab};
})();
