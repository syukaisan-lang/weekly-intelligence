// Evidence-first trial: public originals only. No private bodies, memo or rules in API payloads.
(()=>{
  const Q=window.PublicWorkQA,API='https://cjcnjcblipqsyzxvlbus.supabase.co/functions/v1/work-system-qa';
  const el=id=>document.getElementById(id);
  let sources=[],issues=[],history=[],question='',busy=false,controller=null,apiKey='',providers={},selectedModel='',generation=0;
  const messages={unauthorized:'同步码不正确。请在答疑设置中填写与文章、活动相同的同步码。',model_not_configured:'尚未接入模型 API。可在设置中填写密钥，或复制提问材料到现有 ChatGPT 试答。',model_required:'请先在设置中选择一个可用模型。',model_key_invalid:'模型 API 密钥未通过验证，请检查密钥及其权限。',model_quota_exceeded:'模型额度或调用频率已达上限，请在服务商后台检查。',model_request_failed:'模型请求未完成，请检查模型权限后重试。',answer_incomplete:'回答因长度限制中断，没有展示不完整结论。请缩小问题后重试。',invalid_answer:'模型没有按要求返回可验证的回答，请重试或缩小问题。',invalid_citation:'模型引用了本次证据以外的来源，本次回答未展示。',uncited_answer:'模型未给出可核对的来源，本次回答未展示。请重试或查看原文。',no_public_evidence:'没有找到足够的可读取公开依据，可换个问法或补充收藏原文。',sources_required:'请先勾选至少一篇公开资料。',corpus_unavailable:'公开文章库暂时无法加载，请稍后重试。',service_unavailable:'答疑服务暂时不可用，请稍后重试。',too_many_requests:'请稍等几秒再生成回答。'};
  function status(text){el('qaStatus').textContent=text;}
  function getKey(){return localStorage.getItem('weekly_intelligence_sync_key_v1')||localStorage.getItem('event_radar_sync_key_v1')||'';}
  function provider(){return el('qaProvider').value;}
  function hasModel(){return !!(apiKey||providers[provider()]?.configured)&&!!el('qaModel').value.trim();}
  function selected(){return sources.filter(s=>el('qaSources').querySelector(`input[data-ref="${s.ref}"]`)?.checked);}
  function questionNow(){return el('qaQuestion').value.trim();}
  function controls(){el('qaFind').disabled=busy;el('qaAsk').disabled=busy||!selected().length||!hasModel()||questionNow()!==question;el('qaCopy').disabled=busy||!selected().length||questionNow()!==question;el('qaCancel').hidden=!busy;el('qaConnect').disabled=busy;el('qaProvider').disabled=busy;el('qaModel').disabled=busy;el('qaNew').disabled=busy;el('qaQuestion').readOnly=busy;el('qaScope').disabled=busy;}
  function configNote(){el('qaModelNote').textContent=hasModel()?'已选择模型；点“用所选资料回答”才会调用。问题和所选公开资料会发送给 '+(provider()==='openai'?'OpenAI':'Google Gemini')+'，费用按你的 API 账户规则计算。':'网页直答尚未接入模型。可先检索并复制材料到 ChatGPT；API 设置完成后可在此直接回答。';}
  async function call(action,payload={},signal,keyOverride){
    const key=keyOverride||getKey();if(!key){el('qaSettings').open=true;throw Error('missing_sync_key');}
    const opt={method:action==='status'?'GET':'POST',headers:{'content-type':'application/json','x-sync-key':key},cache:'no-store',referrerPolicy:'no-referrer',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(100000)]):AbortSignal.timeout(100000)};
    if(action!=='status')opt.body=JSON.stringify({action,...payload});
    const r=await fetch(API,opt);const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.error||'service_unavailable');return body;
  }
  function fail(error){if(error.name==='AbortError'){status('已停止，本次没有继续更新回答。');return;}const code=String(error.message||error);status(code==='missing_sync_key'?'请先在“答疑设置”填写现有同步码，然后检索公开资料。':messages[code]||'请求未完成，请稍后重试。');}
  function knowledgeItems(){try{return typeof WK!=='undefined'&&WK?.items||[];}catch{return [];}}
  function renderEvidence(){
    const host=el('qaSources');host.replaceChildren();
    sources.forEach((s,i)=>{
      const box=document.createElement('article');box.className='qa-source';box.id='qa-source-'+s.ref;
      const label=document.createElement('label');label.className='qa-source-heading';
      const input=document.createElement('input');input.type='checkbox';input.checked=i<5;input.dataset.ref=s.ref;input.setAttribute('aria-label','使用资料：'+s.title);input.onchange=controls;
      const link=document.createElement('a');link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='['+(i+1)+'] '+s.title;label.append(input,link);box.append(label);
      const meta=document.createElement('div');meta.className='qa-source-meta';meta.textContent=[s.source,s.published||'发布日期未确认',s.completeness==='summary'?'仅有摘要':s.completeness==='full'?'已抓取正文片段':'公开正文片段'].join(' · ');box.append(meta);
      const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看将发送的公开片段';const body=document.createElement('p');body.className='qa-snippet';body.textContent=s.text;details.append(summary,body);box.append(details);host.append(box);
    });
    el('qaEvidence').hidden=false;el('qaEvidenceTitle').textContent=sources.length?'找到 '+sources.length+' 篇可核对公开资料':'现有公开资料不足';
    el('qaEvidenceNote').textContent=issues.length?issues.length+' 个收藏原文无法读取、受限或暂不支持，已排除。未把个人备注当作原文补入。':'按问题匹配公开原文。可取消不相关的资料，再生成回答；没有资料支撑的内容应列为待验证。';
    if(!sources.length){const empty=document.createElement('p');empty.className='qa-empty';empty.textContent=el('qaScope').value==='collection'?'收藏中没有找到可核验的公开原文。先解锁 Knowledge，或切换“收藏原文 + 公开文章”。':'换成更具体的问题，例如“ROAS下降时如何区分广告浪费与自然销售增长？”';host.append(empty);}
    configNote();controls();
  }
  async function retrieve(){
    if(busy)return;const q=questionNow();if(q.length<2){status('请输入要解决的具体问题。');el('qaQuestion').focus();return;}
    if(el('qaScope').value==='collection'&&!knowledgeItems().length){status('请先解锁下方 Work System，才能在本机识别收藏文章的公开原文链接。');return;}
    busy=true;const seq=++generation;controller=new AbortController();controls();status('正在查找公开原文和可核对依据…');
    try{
      const contextual=[...history.filter(m=>m.role==='user').map(m=>m.content),q].slice(-3).join(' ');
      const urls=Q.collectionURLs(knowledgeItems(),contextual);
      const result=await call('retrieve',{question:q,history,source_urls:urls,scope:el('qaScope').value},controller.signal);
      if(seq!==generation)return;sources=result.sources||[];issues=result.issues||[];question=q;renderEvidence();
      const snapshot=result.snapshot_at?new Date(result.snapshot_at).toLocaleDateString('ja-JP'):'';
      status(sources.length?'已找到依据'+(snapshot?' · 公开文章库更新于 '+snapshot:'')+'。请确认资料后再回答。':'现有公开资料不足，未生成结论。');
      if(!hasModel())el('qaCopy').focus();
    }catch(e){if(seq===generation)fail(e);}finally{if(seq===generation){busy=false;controller=null;controls();}}
  }
  function paragraphAnswer(host,text,refs){
    const map=new Map(refs.map((s,i)=>[s.ref,{...s,n:i+1}]));let pos=0;
    for(const match of text.matchAll(/\[(S[\w-]+)\]/g)){
      host.append(document.createTextNode(text.slice(pos,match.index)));const s=map.get(match[1]);
      if(s){const link=document.createElement('a');link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='['+s.n+']';link.title=s.title;host.append(link);}else host.append(document.createTextNode(match[0]));pos=match.index+match[0].length;
    }host.append(document.createTextNode(text.slice(pos)));
  }
  function showAnswer(q,result){
    const turn=document.createElement('article');turn.className='qa-turn';const title=document.createElement('div');title.className='qa-question';title.textContent=q;
    const body=document.createElement('div');body.className='qa-answer';paragraphAnswer(body,result.answer,result.sources);turn.append(title,body);
    if(result.limitations?.length){const limits=document.createElement('p');limits.className='qa-limits';limits.textContent='资料边界：'+result.limitations.join('；');turn.append(limits);}
    const chips=document.createElement('div');chips.className='qa-chips';for(const text of result.follow_ups||[]){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{el('qaQuestion').value=text;el('qaQuestion').focus();controls();status('已填入追问，点击“查找依据”更新资料。');};chips.append(b);}turn.append(chips);el('qaConversation').append(turn);turn.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function generate(){
    if(busy)return;const chosen=selected(),q=questionNow();if(q!==question){status('问题已修改，请重新查找依据。');return;}if(!chosen.length){status('请勾选至少一篇公开资料。');return;}if(!hasModel()){el('qaSettings').open=true;status('请先设置模型，或复制材料到 ChatGPT 试答。');return;}
    busy=true;const seq=++generation;controller=new AbortController();controls();status('正在基于所选公开资料生成回答…');
    try{
      const result=await call('answer',{question:q,history,source_ids:chosen.map(s=>s.id),source_urls:chosen.map(s=>s.url),provider:provider(),model:el('qaModel').value.trim(),api_key:apiKey},controller.signal);
      if(seq!==generation)return;showAnswer(q,result);history=[...history,{role:'user',content:q},{role:'assistant',content:result.answer}].slice(-4);status('回答已生成。可继续追问；引用可打开原文。');el('qaQuestion').value='';question='';el('qaEvidence').hidden=true;el('qaQuestion').placeholder='继续追问，例如：如果预算减半，优先验证哪一步？';
    }catch(e){if(seq===generation)fail(e);}finally{if(seq===generation){busy=false;controller=null;controls();}}
  }
  async function copyMaterials(){
    const chosen=selected();if(!chosen.length||questionNow()!==question){status('请先查找并选择当前问题的公开依据。');return;}
    const text=Q.handoffPrompt(question,chosen,history);try{await navigator.clipboard.writeText(text);status('已复制问题和公开依据，可粘贴到 ChatGPT 或其他 AI；未包含私人工作经验和 Notion 备注。');}
    catch{el('qaHandoff').hidden=false;el('qaHandoff').value=text;el('qaHandoff').focus();el('qaHandoff').select();status('浏览器不允许自动复制，请复制下方已选中的提问材料。');}
  }
  async function connect(){
    if(busy)return;const code=el('qaSyncKey').value.trim();
    apiKey=el('qaApiKey').value.trim()||apiKey;el('qaApiKey').value='';el('qaSyncKey').value='';busy=true;controls();status('正在检查模型 API 和可用模型…');
    try{
      const config=await call('status',{},undefined,code||getKey());providers=config.providers||{};if(code)localStorage.setItem('weekly_intelligence_sync_key_v1',code);
      if(!apiKey&&!providers[provider()]?.configured){configNote();status(messages.model_not_configured);return;}
      const result=await call('models',{provider:provider(),api_key:apiKey});const select=el('qaModel'),current=select.value;select.replaceChildren();
      const list=result.models||[];if(!list.length)throw Error('model_required');
      for(const m of list){const o=document.createElement('option');o.value=m.id;o.textContent=m.name+' · '+m.id;select.append(o);}
      const preferred=list.find(m=>m.id===current)||list.find(m=>provider()==='openai'?/mini/.test(m.id):/flash/.test(m.id)&&!/-image|-live|-tts/.test(m.id))||list[0];select.value=preferred.id;selectedModel=preferred.id;
      status('已验证密钥并读取可用模型。点击“用所选资料回答”才开始调用生成。');el('qaSettings').open=false;
    }catch(e){fail(e);}finally{busy=false;controls();configNote();}
  }
  function mount(){
    const target=document.getElementById('workSystemGate');if(!target)return;
    const section=document.createElement('section');section.className='work-qa';section.id='workSystemQA';
    section.innerHTML='<div class="work-qa-head"><div><div class="qa-eyebrow">ASK YOUR KNOWLEDGE · 试用</div><h2>用知识回答工作问题</h2><p class="muted small">先找公开依据，再整理成带引用的回答。支持追问，资料不足时明确说明。</p></div><button id="qaNew" class="text-btn" type="button">新问题</button></div><div class="qa-chips" id="qaExamples"></div><label for="qaQuestion" class="qa-note">你现在需要解决什么？</label><textarea id="qaQuestion" maxlength="1800" placeholder="例如：ROAS下降，但自然销售增长，应该先排查什么？"></textarea><div class="qa-actions"><select id="qaScope" class="qa-scope" aria-label="资料范围"><option value="combined">收藏原文 + 公开文章</option><option value="collection">只用 Knowledge 收藏原文（需解锁）</option></select><button id="qaFind" type="button" class="btn qa-primary">查找依据</button><button id="qaCancel" class="text-btn" type="button" hidden>停止</button></div><p class="qa-note">发送范围：你的问题、最近两轮对话和所选公开资料。私人工作经验、Notion 备注和体系规则不发送。解锁后可在本机识别收藏原文链接。</p><div id="qaStatus" class="qa-status" role="status" aria-live="polite">可先查找资料并复制到 ChatGPT；网页直答需在下方设置模型 API。</div><details id="qaSettings" class="qa-settings"><summary>答疑设置 · 同步码与模型 API</summary><p class="qa-note">沿用文章或活动的同步码。模型 API 密钥仅保留在本页内存，刷新即清空，不写入备份。调用可能按你的 API 账户规则计费。</p><div class="qa-setting-grid"><label><span>同步码（已绑定设备自动沿用）</span><input id="qaSyncKey" type="password" autocomplete="off" placeholder="已有同步码，无需重复填写"></label><label><span>模型服务商</span><select id="qaProvider"><option value="openai">OpenAI / ChatGPT</option><option value="gemini">Google Gemini</option></select></label><label><span>API 密钥（默认使用 OpenAI）</span><input id="qaApiKey" type="password" autocomplete="off" placeholder="在网页填写，不要发到聊天中"></label><label><span>可用模型（验证密钥后读取）</span><select id="qaModel"><option value="">尚未选择模型</option></select></label></div><div class="qa-actions"><button id="qaConnect" class="btn" type="button">验证并读取模型</button><button id="qaForget" class="text-btn" type="button">清除本页 API 密钥</button><a class="qa-hint-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" id="qaKeyLink">获取 OpenAI API 密钥 ↗</a></div><p id="qaModelNote" class="qa-note"></p></details><section id="qaEvidence" class="qa-evidence" hidden><h3 id="qaEvidenceTitle"></h3><p id="qaEvidenceNote" class="qa-note"></p><div id="qaSources" class="qa-sources"></div><div class="qa-actions"><button id="qaAsk" class="btn qa-primary" type="button" disabled>用所选资料回答</button><button id="qaCopy" class="btn secondary" type="button" disabled>复制提问材料到 ChatGPT</button></div><textarea id="qaHandoff" class="qa-handoff" readonly aria-label="可复制的公开资料与提问" hidden></textarea></section><div id="qaConversation" aria-live="polite"></div>';
    target.before(section);
    for(const text of ['新品预算有限，先做认知还是转化？','ROAS下降但自然销售增长，先查什么？','日本消费者的消费观发生了什么变化？']){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{if(busy)return;el('qaQuestion').value=text;el('qaQuestion').focus();controls();};el('qaExamples').append(b);}
    el('qaFind').onclick=retrieve;el('qaAsk').onclick=generate;el('qaCopy').onclick=copyMaterials;el('qaConnect').onclick=connect;
    el('qaQuestion').addEventListener('input',controls);el('qaQuestion').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();retrieve();}});
    el('qaModel').onchange=()=>{selectedModel=el('qaModel').value;controls();configNote();};
    el('qaProvider').onchange=()=>{apiKey='';el('qaApiKey').value='';el('qaModel').replaceChildren(new Option('尚未选择模型',''));selectedModel='';el('qaKeyLink').href=provider()==='openai'?'https://platform.openai.com/api-keys':'https://aistudio.google.com/apikey';el('qaKeyLink').textContent=provider()==='openai'?'获取 OpenAI API 密钥 ↗':'获取 Gemini API 密钥 ↗';controls();configNote();};
    el('qaForget').onclick=()=>{apiKey='';el('qaApiKey').value='';controls();configNote();status('本页 API 密钥已清除。');};
    el('qaCancel').onclick=()=>{controller?.abort();generation++;busy=false;controller=null;controls();status('已停止等待；若模型请求已经发出，服务商仍可能计入本次用量。');};
    el('qaNew').onclick=()=>{history=[];sources=[];issues=[];question='';el('qaConversation').replaceChildren();el('qaSources').replaceChildren();el('qaEvidence').hidden=true;el('qaQuestion').value='';el('qaQuestion').focus();el('qaHandoff').value='';el('qaHandoff').hidden=true;controls();status('已开始新问题。旧对话仅在本页内存中，未上传保存。');};
    controls();configNote();
    // No question, private data or model request is sent on page load.
    window.WorkSystemQA={clear:()=>{apiKey='';history=[];sources=[];question='';el('qaConversation').replaceChildren();el('qaSources').replaceChildren();el('qaEvidence').hidden=true;el('qaApiKey').value='';el('qaHandoff').value='';controls();}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
