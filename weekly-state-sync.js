(() => {
  const REPO='syukaisan-lang/weekly-intelligence';
  const CLOUD_URL='data/weekly-state.enc.json';
  const BACKUP_PENDING_KEY='weekly_intelligence_backup_pending_v1';
  const DIRTY_SINCE_KEY='weekly_intelligence_dirty_since_v1';
  const REMIND_AFTER_MS=7*24*60*60*1000;
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const BACKUP_WINDOW_NAME='weeklyStateBackupConfirm';
  let backupInFlight=false;

  function toast(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),7000);
  }

  function normalizedBackupStatus(v){
    const status=v?.status||'new';
    if((status==='read'||status==='save')&&v?.status_origin!==TRUSTED_STATUS_ORIGIN)return 'new';
    return status;
  }

  function meaningfulEntries(){
    const out={};
    for(const [id,v] of Object.entries(state||{})){
      if(!v||typeof v!=='object')continue;
      const status=normalizedBackupStatus(v),feedback=v.feedback??null;
      const meaningful=status!=='new'||feedback!==null;
      if(!meaningful)continue;
      out[id]={status,feedback,updated_at:Number(v.updated_at||0)};
      if(v.status_origin)out[id].status_origin=v.status_origin;
      if(v.status_action)out[id].status_action=v.status_action;
      if(v.status_updated_at)out[id].status_updated_at=Number(v.status_updated_at||0);
    }
    return out;
  }

  function migrateTimestamps(){
    const now=Date.now();let changed=false;
    for(const [id,v] of Object.entries(state||{})){
      if(!v||typeof v!=='object')continue;
      const touched=(normalizedBackupStatus(v)!=='new')||v.feedback;
      if(touched&&!Number(v.updated_at)){v.updated_at=now;state[id]=v;changed=true;}
    }
    if(changed){save();if(!localStorage.getItem(DIRTY_SINCE_KEY))localStorage.setItem(DIRTY_SINCE_KEY,String(now));}
  }

  function latestLocalUpdate(){return Object.values(state||{}).reduce((m,v)=>Math.max(m,Number(v?.updated_at||0)),0);}

  function stamp(id){
    const cur=state[id]||{status:'new',feedback:null};cur.updated_at=Date.now();state[id]=cur;save();
    if(!localStorage.getItem(DIRTY_SINCE_KEY))localStorage.setItem(DIRTY_SINCE_KEY,String(cur.updated_at));
    setCloudStatus('本机已自动保存 · 建议每周备份一次');
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
      const pending=localStorage.getItem(BACKUP_PENDING_KEY);
      const cloudTs=env?.created_at?Date.parse(env.created_at):0;
      const pendingTs=pending?Date.parse(pending):0;
      if(pending&&cloudTs>=pendingTs)localStorage.removeItem(BACKUP_PENDING_KEY);
      if(cloudTs&&cloudTs>=latestLocalUpdate())localStorage.removeItem(DIRTY_SINCE_KEY);
      const dirtySince=Number(localStorage.getItem(DIRTY_SINCE_KEY)||0);
      const dirty=latestLocalUpdate()>cloudTs;
      if(localStorage.getItem(BACKUP_PENDING_KEY)){setCloudStatus('备份待确认 · 若 GitHub 页面尚未提交，请粘贴密文后提交');return;}
      if(dirty){
        const old=dirtySince&&Date.now()-dirtySince>=REMIND_AFTER_MS;
        setCloudStatus(old?'本机已自动保存 · 已超过 7 天未备份':'本机已自动保存 · 建议每周备份一次');
        return;
      }
      if(!env){setCloudStatus('本机自动保存 · 尚无云端备份');return;}
      setCloudStatus(`云端已备份 ${new Date(env.created_at).toLocaleString('ja-JP')}`);
    }catch(e){setCloudStatus('本机已保存 · 云备份状态暂时无法读取');}
  }

  async function ensureValidatedPassphrase(){
    if(typeof loadKnowledgeData!=='function')throw new Error('Private knowledge helper is unavailable');
    if(typeof hasKnowledgePassphrase==='function'&&hasKnowledgePassphrase())return true;
    const k=await loadKnowledgeData({prompt:true});
    if(k?.locked)throw new Error('Dashboard 密码未通过验证');
    return true;
  }

  function reserveBackupWindow(){
    const win=window.open('about:blank',BACKUP_WINDOW_NAME);
    if(win){
      try{
        win.document.title='准备 Weekly 备份…';
        win.document.body.innerHTML='<p style="font-family:sans-serif;padding:24px">正在本地加密并复制备份数据…</p>';
      }catch(_){}
    }
    return win;
  }

  function closeReservedWindow(win){
    if(!win||win.closed)return;
    try{win.close();}catch(_){}
  }

  function navigateBackupWindow(win,url){
    if(win&&!win.closed){
      try{win.location.replace(url);win.opener=null;return;}catch(_){}
    }
    location.href=url;
  }

  async function copyBackupLine(text){
    if(navigator.clipboard?.writeText){
      try{await navigator.clipboard.writeText(text);return true;}catch(_){}
    }
    const ta=document.createElement('textarea');
    ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';
    document.body.appendChild(ta);ta.focus();ta.select();
    let ok=false;try{ok=document.execCommand('copy');}catch(_){}
    ta.remove();
    if(!ok)throw new Error('浏览器没有允许自动复制密文，请允许剪贴板权限后重试');
    return true;
  }

  async function backup(){
    if(backupInFlight){toast('备份正在准备中，请不要重复点击。');return;}
    backupInFlight=true;
    const button=document.getElementById('backupWeeklyStateBtn');if(button)button.disabled=true;
    const reserved=reserveBackupWindow();
    try{
      await ensureValidatedPassphrase();
      const snapshot=meaningfulEntries();
      const payload={schema:3,kind:'weekly-reading-state',created_at:new Date().toISOString(),state:snapshot};
      const env=await encryptPrivatePayload(payload,{kind:'weekly-state',compress:true});
      const encoded=btoa(JSON.stringify(env));
      const clipboardLine=`STATE_ENVELOPE_B64: ${encoded}`;
      await copyBackupLine(clipboardLine);

      const title='[WEEKLY-STATE] '+new Date().toISOString().slice(0,19).replace('T',' ');
      const shortBody='Weekly Intelligence 加密备份。\n\n请在下面空白处直接粘贴（Ctrl+V / ⌘V）刚才自动复制的整行密文，然后点击 Submit new issue。\n\n';
      const url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(shortBody)}`;
      if(url.length>2000)throw new Error('GitHub 确认链接异常过长');

      localStorage.setItem(BACKUP_PENDING_KEY,env.created_at||new Date().toISOString());
      setCloudStatus('密文已复制 · 请在 GitHub 页面粘贴后提交');
      navigateBackupWindow(reserved,url);
      toast(`已加密并复制 ${Object.keys(snapshot).length} 条人工记录。GitHub 页面只需粘贴一次并提交。`);
    }catch(e){
      closeReservedWindow(reserved);
      toast('备份失败：'+e.message);
    }finally{
      backupInFlight=false;if(button)button.disabled=false;
    }
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
          state[id]={status:rv.status||'new',feedback:rv.feedback??null,updated_at:remoteTs};
          if(rv.status_origin)state[id].status_origin=rv.status_origin;
          if(rv.status_action)state[id].status_action=rv.status_action;
          if(rv.status_updated_at)state[id].status_updated_at=Number(rv.status_updated_at||0);
          applied++;
        }else keptLocal++;
      }
      save();
      if(typeof rebuildPrefs==='function')rebuildPrefs();
      if(typeof render==='function')render();
      if(typeof updateProgressTabs==='function')updateProgressTabs();
      localStorage.removeItem(BACKUP_PENDING_KEY);
      if(!latestLocalUpdate()||Date.parse(env.created_at||0)>=latestLocalUpdate())localStorage.removeItem(DIRTY_SINCE_KEY);
      await refreshCloudStatus();
      toast(`已合并云端标记：更新 ${applied} 条，本机较新的 ${keptLocal} 条保留。`);
    }catch(e){toast('恢复失败：密码不正确或备份无法读取。');}
  }

  function mount(){
    const root=document.querySelector('.reading-progress');if(!root||document.getElementById('weeklyStateTools'))return;
    const tools=document.createElement('div');tools.id='weeklyStateTools';tools.className='controls';tools.style.marginTop='10px';
    const backupBtn=document.createElement('button');backupBtn.id='backupWeeklyStateBtn';backupBtn.className='btn';backupBtn.type='button';backupBtn.textContent='备份本周标记';backupBtn.onclick=backup;
    const restoreBtn=document.createElement('button');restoreBtn.className='btn secondary';restoreBtn.type='button';restoreBtn.textContent='恢复云端';restoreBtn.onclick=restore;
    const status=document.createElement('span');status.id='weeklyCloudStatus';status.className='muted small';status.textContent='检查保存状态…';
    const help=document.createElement('span');help.className='muted small';help.textContent='备份时密文只复制到剪贴板，GitHub 页面粘贴后提交；不会再把密文放进 URL。';
    tools.append(backupBtn,restoreBtn,status,help);root.appendChild(tools);refreshCloudStatus();
  }

  migrateTimestamps();
  const originalFeedback=window.feedback;
  if(typeof originalFeedback==='function')window.feedback=feedback=function(a,v){originalFeedback(a,v);stamp(a.id);};
  const originalSetStatus=window.setStatus;
  if(typeof originalSetStatus==='function')window.setStatus=setStatus=function(a,v){originalSetStatus(a,v);stamp(a.id);};

  const reset=document.getElementById('resetLearning');
  if(reset){
    let before={};
    reset.addEventListener('click',()=>{before={};for(const [id,v] of Object.entries(state||{}))before[id]=v?.feedback??null;},{capture:true});
    reset.addEventListener('click',()=>setTimeout(()=>{
      const now=Date.now();let changed=false;
      for(const [id,v] of Object.entries(state||{})){
        if(!v||typeof v!=='object')continue;
        if((before[id]??null)!==(v.feedback??null)){v.updated_at=now;state[id]=v;changed=true;}
      }
      if(changed){save();if(!localStorage.getItem(DIRTY_SINCE_KEY))localStorage.setItem(DIRTY_SINCE_KEY,String(now));setCloudStatus('本机已自动保存 · 建议每周备份一次');}
    },0));
  }

  window.addEventListener('focus',refreshCloudStatus);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCloudStatus();});
  setInterval(refreshCloudStatus,60000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  window.backupWeeklyState=backup;
  window.restoreWeeklyState=restore;
})();
