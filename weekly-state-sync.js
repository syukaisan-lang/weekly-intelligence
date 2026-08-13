(() => {
  const REPO='syukaisan-lang/weekly-intelligence';
  const CLOUD_URL='data/weekly-state.enc.json';
  const BACKUP_PENDING_KEY='weekly_intelligence_backup_pending_v1';

  function toast(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),5500);
  }

  function meaningfulEntries(){
    const out={};
    for(const [id,v] of Object.entries(state||{})){
      if(!v||typeof v!=='object')continue;
      if(!('status' in v)&&!('feedback' in v)&&!v.updated_at)continue;
      out[id]={status:v.status||'new',feedback:v.feedback??null,updated_at:Number(v.updated_at||0)};
    }
    return out;
  }

  function migrateTimestamps(){
    const now=Date.now();let changed=false;
    for(const [id,v] of Object.entries(state||{})){
      if(!v||typeof v!=='object')continue;
      const touched=(v.status&&v.status!=='new')||v.feedback;
      if(touched&&!Number(v.updated_at)){v.updated_at=now;state[id]=v;changed=true;}
    }
    if(changed)save();
  }

  function stamp(id){
    const cur=state[id]||{status:'new',feedback:null};cur.updated_at=Date.now();state[id]=cur;save();
    setCloudStatus('本机有未备份修改');
  }

  function setCloudStatus(text){const el=document.getElementById('weeklyCloudStatus');if(el)el.textContent=text;}

  async function fetchCloudEnvelope(){
    const r=await fetch(CLOUD_URL,{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
    if(r.status===404)return null;
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function refreshCloudStatus(){
    try{
      const env=await fetchCloudEnvelope();
      if(!env){setCloudStatus('尚无云备份');return;}
      const when=env.created_at?new Date(env.created_at).toLocaleString('ja-JP'):'已有云备份';
      const pending=localStorage.getItem(BACKUP_PENDING_KEY);
      setCloudStatus(pending?'备份请求已提交 · 等待 GitHub 写入':`云端备份 ${when}`);
    }catch(e){setCloudStatus('云备份状态暂时无法读取');}
  }

  async function ensureValidatedPassphrase(){
    if(typeof loadKnowledgeData!=='function')throw new Error('Private knowledge helper is unavailable');
    if(typeof hasKnowledgePassphrase==='function'&&hasKnowledgePassphrase())return true;
    const k=await loadKnowledgeData({prompt:true});
    if(k?.locked)throw new Error('Dashboard 密码未通过验证');
    return true;
  }

  async function backup(){
    try{
      await ensureValidatedPassphrase();
      const snapshot=meaningfulEntries();
      const payload={schema:2,kind:'weekly-reading-state',created_at:new Date().toISOString(),state:snapshot};
      const env=await encryptPrivatePayload(payload,{kind:'weekly-state',compress:true});
      const encoded=btoa(JSON.stringify(env));
      const title='[WEEKLY-STATE] '+new Date().toISOString().slice(0,19).replace('T',' ');
      const body=`STATE_ENVELOPE_B64: ${encoded}\n\nWeekly Intelligence 的人工标记加密备份。Issue 中只有 AES-GCM 密文；Action 只接受仓库所有者提交，并会在写入后自动关闭。`;
      const url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      if(url.length>60000)throw new Error('标记记录过多，GitHub 确认链接已超过安全长度');
      localStorage.setItem(BACKUP_PENDING_KEY,new Date().toISOString());
      setCloudStatus('备份请求待确认');
      const win=window.open(url,'_blank','noopener,noreferrer');if(!win)location.href=url;
      toast(`已加密 ${Object.keys(snapshot).length} 条人工记录。请在 GitHub 页面提交一次 Issue，之后会自动保存并关闭。`);
    }catch(e){toast('备份失败：'+e.message);}
  }

  async function restore(){
    try{
      const env=await fetchCloudEnvelope();
      if(!env){toast('目前还没有云端备份。');return;}
      const payload=await decryptPrivateEnvelopeData(env,{prompt:true});
      if(!payload||!payload.state||typeof payload.state!=='object')throw new Error('云端备份格式不正确');
      let applied=0,keptLocal=0;
      for(const [id,rv] of Object.entries(payload.state)){
        if(!rv||typeof rv!=='object')continue;
        const remoteTs=Number(rv.updated_at||0),lv=state[id],localTs=Number(lv?.updated_at||0);
        if(!lv||remoteTs>localTs){
          state[id]={status:rv.status||'new',feedback:rv.feedback??null,updated_at:remoteTs};applied++;
        }else keptLocal++;
      }
      save();
      if(typeof rebuildPrefs==='function')rebuildPrefs();
      if(typeof render==='function')render();
      if(typeof updateProgressTabs==='function')updateProgressTabs();
      localStorage.removeItem(BACKUP_PENDING_KEY);
      await refreshCloudStatus();
      toast(`已合并云端标记：更新 ${applied} 条，本机较新的 ${keptLocal} 条保留。`);
    }catch(e){toast('恢复失败：密码不正确或备份无法读取。');}
  }

  function mount(){
    const root=document.querySelector('.reading-progress');if(!root||document.getElementById('weeklyStateTools'))return;
    const tools=document.createElement('div');tools.id='weeklyStateTools';tools.className='controls';tools.style.marginTop='10px';
    const backupBtn=document.createElement('button');backupBtn.className='btn';backupBtn.type='button';backupBtn.textContent='备份标记';backupBtn.onclick=backup;
    const restoreBtn=document.createElement('button');restoreBtn.className='btn secondary';restoreBtn.type='button';restoreBtn.textContent='恢复云端';restoreBtn.onclick=restore;
    const status=document.createElement('span');status.id='weeklyCloudStatus';status.className='muted small';status.textContent='检查云备份…';
    tools.append(backupBtn,restoreBtn,status);root.appendChild(tools);refreshCloudStatus();
  }

  migrateTimestamps();
  const originalFeedback=window.feedback;
  if(typeof originalFeedback==='function')window.feedback=feedback=function(a,v){originalFeedback(a,v);stamp(a.id);};
  const originalSetStatus=window.setStatus;
  if(typeof originalSetStatus==='function')window.setStatus=setStatus=function(a,v){originalSetStatus(a,v);stamp(a.id);};
  document.getElementById('resetLearning')?.addEventListener('click',()=>setTimeout(()=>{
    const now=Date.now();for(const [id,v] of Object.entries(state||{})){if(v&&typeof v==='object'){v.updated_at=now;state[id]=v;}}save();setCloudStatus('本机有未备份修改');
  },0));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  window.backupWeeklyState=backup;
  window.restoreWeeklyState=restore;
})();
