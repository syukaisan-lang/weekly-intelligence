(() => {
  const REPO='syukaisan-lang/weekly-intelligence';
  const VALID_STATUS=new Set(['new','later','read','save','skip']);
  const VALID_FEEDBACK=new Set([null,'accurate','more','bad','less']);

  function marked(x){return !!x&&(x.status&&x.status!=='new'||x.feedback);}
  function compactState(){
    const out={};
    for(const [id,raw] of Object.entries(state||{})){
      if(!marked(raw))continue;
      const x={status:VALID_STATUS.has(raw.status)?raw.status:'new',feedback:VALID_FEEDBACK.has(raw.feedback)?raw.feedback:null,updated_at:Number(raw.updated_at||0)};
      if(!x.updated_at)x.updated_at=Date.now();
      out[id]=x;
    }
    return out;
  }
  function persistAndRender(){
    save();
    if(typeof rebuildPrefs==='function')rebuildPrefs();
    if(typeof render==='function')render();
    if(typeof updateProgressTabs==='function')updateProgressTabs();
    refreshStatusText();
  }
  function mergeStateMap(incoming,{importWinsLegacy=false}={}){
    let changed=0;
    const now=Date.now();
    for(const [id,raw] of Object.entries(incoming||{})){
      if(!raw||typeof raw!=='object')continue;
      const remote={status:VALID_STATUS.has(raw.status)?raw.status:'new',feedback:VALID_FEEDBACK.has(raw.feedback)?raw.feedback:null,updated_at:Number(raw.updated_at||0)};
      if(!marked(remote))continue;
      if(!remote.updated_at&&importWinsLegacy)remote.updated_at=now;
      const local=state[id];
      if(!local||!marked(local)){
        state[id]=remote;changed++;continue;
      }
      const localTs=Number(local.updated_at||0),remoteTs=Number(remote.updated_at||0);
      if(remoteTs>localTs||(!localTs&&!remoteTs&&importWinsLegacy)){
        state[id]=remote;changed++;
      }
    }
    if(changed)persistAndRender();
    return changed;
  }
  function countMarked(){return Object.values(state||{}).filter(marked).length;}
  function setStatusText(text){const el=document.getElementById('weeklyStateSyncStatus');if(el)el.textContent=text;}
  function refreshStatusText(){const n=countMarked();setStatusText(n?`本机有 ${n} 篇人工标记 · 可加密备份到云端`:'本机没有人工标记 · 如其他设备有旧记录，可先从那里导出/备份');}
  function showToast(text){let box=document.getElementById('weeklyStateToast');if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),5200);}

  const originalFeedback=feedback;
  feedback=function(a,v){
    originalFeedback(a,v);
    const cur=state[a.id];if(cur){cur.updated_at=Date.now();state[a.id]=cur;save();}
    refreshStatusText();
  };
  window.feedback=feedback;

  const originalSetStatus=setStatus;
  setStatus=function(a,v){
    originalSetStatus(a,v);
    const cur=state[a.id];if(cur){cur.updated_at=Date.now();state[a.id]=cur;save();}
    refreshStatusText();
  };
  window.setStatus=setStatus;

  async function fetchCloudMeta(){
    const r=await fetch('data/weekly-state.json',{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
  }
  async function restoreCloud(){
    try{
      setStatusText('正在读取云端加密标记…');
      const meta=await fetchCloudMeta();
      if(!meta?.meta?.encrypted_full_data){refreshStatusText();showToast('目前还没有云端标记备份。');return;}
      const env=await fetch('data/weekly-state.enc.json',{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();});
      const payload=await decryptPrivateEnvelopeData(env,{prompt:true});
      const changed=mergeStateMap(payload?.state||{});
      refreshStatusText();showToast(changed?`已从云端合并 ${changed} 条标记。`:'云端与本机标记已经一致。');
    }catch(e){refreshStatusText();showToast(`恢复失败：${e.message}`);}
  }
  async function backupCloud(){
    const snapshot=compactState();
    const count=Object.keys(snapshot).length;
    if(!count){showToast('本机没有可备份的人工标记。');return;}
    try{
      setStatusText(`正在加密 ${count} 条人工标记…`);
      if(typeof loadKnowledgeData==='function'&&!hasKnowledgePassphrase()){
        const check=await loadKnowledgeData({prompt:true});
        if(check?.locked)throw new Error('Dashboard 密码验证失败');
      }
      const payload={version:1,snapshot_at:new Date().toISOString(),state:snapshot};
      const env=await encryptPrivatePayload(payload,{kind:'weekly-state',compress:true});
      const title=`[WEEKLY-STATE] ${new Date().toISOString().slice(0,19)}`;
      const body=`WEEKLY_STATE_ENVELOPE:\n${JSON.stringify(env)}`;
      const url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      setStatusText('加密完成 · 在 GitHub 提交打开的备份请求即可完成云端保存');
      location.href=url;
    }catch(e){refreshStatusText();showToast(`备份失败：${e.message}`);}
  }
  function exportState(){
    const payload={version:1,exported_at:new Date().toISOString(),state:compactState()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`weekly-intelligence-state-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast(`已导出 ${Object.keys(payload.state).length} 条标记。`);
  }
  async function importState(file){
    if(!file)return;
    try{
      const raw=JSON.parse(await file.text()),incoming=raw?.state&&typeof raw.state==='object'?raw.state:raw;
      const changed=mergeStateMap(incoming,{importWinsLegacy:true});
      showToast(`已导入/合并 ${changed} 条标记。`);
    }catch(e){showToast(`导入失败：${e.message}`);}
  }

  document.getElementById('restoreWeeklyState')?.addEventListener('click',restoreCloud);
  document.getElementById('backupWeeklyState')?.addEventListener('click',backupCloud);
  document.getElementById('exportWeeklyState')?.addEventListener('click',exportState);
  const importBtn=document.getElementById('importWeeklyState'),importFile=document.getElementById('importWeeklyStateFile');
  importBtn?.addEventListener('click',()=>importFile?.click());
  importFile?.addEventListener('change',async()=>{await importState(importFile.files?.[0]);importFile.value='';});
  refreshStatusText();
})();