(() => {
  const REPO='syukaisan-lang/weekly-intelligence';
  const CLOUD_URL='data/weekly-state.enc.json';
  const CLOUD_META_URL='data/weekly-state.json';
  const BACKUP_PENDING_KEY='weekly_intelligence_backup_pending_v1';
  const DIRTY_SINCE_KEY='weekly_intelligence_dirty_since_v1';
  const REMIND_AFTER_MS=7*24*60*60*1000;
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const BACKUP_WINDOW_NAME='weeklyStateBackupConfirm';
  const MAX_DELTA_ENTRIES=50;
  const MAX_ISSUE_URL_LENGTH=7500;
  let backupInFlight=false;

  const STATUS_TO_CODE={new:'n',later:'l',read:'r',save:'s',skip:'k'};
  const CODE_TO_STATUS={n:'new',l:'later',r:'read',s:'save',k:'skip'};
  const FEEDBACK_TO_CODE={accurate:'a',more:'m',bad:'b',less:'l'};
  const CODE_TO_FEEDBACK={a:'accurate',m:'more',b:'bad',l:'less'};
  const ACTION_TO_CODE={feedback:'f',status:'s'};
  const CODE_TO_ACTION={f:'feedback',s:'status'};

  function toast(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),6500);
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

  function compareCursor(a,b){
    const at=Number(a?.ts||0),bt=Number(b?.ts||0);
    if(at!==bt)return at-bt;
    return String(a?.id||'').localeCompare(String(b?.id||''));
  }

  function latestLocalCursor(){
    let cur={ts:0,id:''};
    for(const [id,v] of Object.entries(meaningfulEntries())){
      const c={ts:Number(v.updated_at||0),id};
      if(compareCursor(c,cur)>0)cur=c;
    }
    return cur;
  }

  function stamp(id){
    const cur=state[id]||{status:'new',feedback:null};cur.updated_at=Date.now();state[id]=cur;save();
    if(!localStorage.getItem(DIRTY_SINCE_KEY))localStorage.setItem(DIRTY_SINCE_KEY,String(cur.updated_at));
    setCloudStatus('本机已自动保存 · 建议每周备份一次');
  }

  function setCloudStatus(text){const el=document.getElementById('weeklyCloudStatus');if(el)el.textContent=text;}

  async function fetchJson(url,{optional=false}={}){
    const r=await fetch(url,{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
    if(r.status===404&&optional)return null;
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function fetchCloudEnvelope(){return fetchJson(CLOUD_URL,{optional:true});}
  async function fetchCloudMeta(){return (await fetchJson(CLOUD_META_URL,{optional:true}))||{meta:{}};}

  function cloudCursor(metaDoc){
    const meta=metaDoc?.meta||{};
    if(Number(meta.cursor_updated_at||0))return {ts:Number(meta.cursor_updated_at),id:String(meta.cursor_id||'')};
    const snapshotTs=Date.parse(meta.snapshot_at||0)||0;
    return {ts:snapshotTs,id:'\uffff'};
  }

  function cloudLatestMs(metaDoc,baseEnv){
    const meta=metaDoc?.meta||{};
    return Date.parse(meta.latest_at||meta.snapshot_at||baseEnv?.created_at||0)||0;
  }

  async function refreshCloudStatus(){
    try{
      const [metaDoc,baseEnv]=await Promise.all([fetchCloudMeta(),fetchCloudEnvelope()]);
      const pending=localStorage.getItem(BACKUP_PENDING_KEY);
      const cloudLatest=cloudLatestMs(metaDoc,baseEnv);
      const pendingTs=pending?Date.parse(pending):0;
      if(pending&&cloudLatest>=pendingTs)localStorage.removeItem(BACKUP_PENDING_KEY);
      const localCursor=latestLocalCursor(),remoteCursor=cloudCursor(metaDoc);
      const dirty=compareCursor(localCursor,remoteCursor)>0;
      if(!dirty)localStorage.removeItem(DIRTY_SINCE_KEY);
      if(localStorage.getItem(BACKUP_PENDING_KEY)){setCloudStatus('加密备份已提交 · 等待 GitHub 写入');return;}
      if(dirty){
        const dirtySince=Number(localStorage.getItem(DIRTY_SINCE_KEY)||0);
        const old=dirtySince&&Date.now()-dirtySince>=REMIND_AFTER_MS;
        setCloudStatus(old?'本机已自动保存 · 已超过 7 天未备份':'本机已自动保存 · 建议每周备份一次');
        return;
      }
      if(!baseEnv){setCloudStatus('本机自动保存 · 尚无云端备份');return;}
      setCloudStatus(`云端已备份 ${new Date(cloudLatest||Date.now()).toLocaleString('ja-JP')}`);
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
      try{win.document.title='准备 Weekly 备份…';win.document.body.innerHTML='<p style="font-family:sans-serif;padding:24px">正在准备加密备份…</p>';}catch(_){}
    }
    return win;
  }

  function closeReservedWindow(win){if(win&&!win.closed){try{win.close();}catch(_){}}}

  function navigateBackupWindow(win,url){
    if(win&&!win.closed){try{win.location.replace(url);win.opener=null;return;}catch(_){}}
    location.href=url;
  }

  function deltaCandidates(cursor){
    return Object.entries(meaningfulEntries())
      .map(([id,v])=>({id,v,c:{ts:Number(v.updated_at||0),id}}))
      .filter(x=>compareCursor(x.c,cursor)>0)
      .sort((a,b)=>compareCursor(a.c,b.c));
  }

  function compactRows(items){
    return items.map(({id,v})=>[
      id,
      STATUS_TO_CODE[v.status]||v.status||'n',
      v.feedback?(FEEDBACK_TO_CODE[v.feedback]||v.feedback):'',
      Number(v.updated_at||0),
      v.status_origin===TRUSTED_STATUS_ORIGIN?'h':(v.status_origin||''),
      ACTION_TO_CODE[v.status_action]||v.status_action||'',
      Number(v.status_updated_at||0)
    ]);
  }

  function decodeRows(rows){
    const out={};
    for(const row of rows||[]){
      if(!Array.isArray(row)||!row[0])continue;
      const [id,s,f,u,o,a,su]=row;
      const item={status:CODE_TO_STATUS[s]||s||'new',feedback:f?(CODE_TO_FEEDBACK[f]||f):null,updated_at:Number(u||0)};
      if(o)item.status_origin=o==='h'?TRUSTED_STATUS_ORIGIN:o;
      if(a)item.status_action=CODE_TO_ACTION[a]||a;
      if(su)item.status_updated_at=Number(su);
      out[id]=item;
    }
    return out;
  }

  async function buildDeltaIssue(metaDoc,candidates){
    let count=Math.min(MAX_DELTA_ENTRIES,candidates.length);
    while(count>=1){
      const batch=candidates.slice(0,count);
      const rows=compactRows(batch);
      const through=batch[batch.length-1].c;
      const payload={schema:4,kind:'weekly-reading-delta',created_at:new Date().toISOString(),rows};
      const env=await encryptPrivatePayload(payload,{kind:'weekly-state-delta',compress:true});
      env.cursor_updated_at=through.ts;
      env.cursor_id=through.id;
      env.entry_count=rows.length;
      env.base_snapshot_at=metaDoc?.meta?.snapshot_at||null;
      const encoded=btoa(JSON.stringify(env));
      const title='[WEEKLY-STATE] '+new Date().toISOString().slice(0,19).replace('T',' ');
      const body=`STATE_ENVELOPE_B64: ${encoded}\n\nWeekly Intelligence 的增量加密备份。内容已自动填好，只需点击 Submit new issue。`;
      const url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      if(url.length<=MAX_ISSUE_URL_LENGTH)return {url,env,count,total:candidates.length};
      if(count===1)throw new Error('单条备份数据异常过大，无法生成 GitHub 确认页');
      count=Math.max(1,Math.floor(count/2));
    }
    throw new Error('无法生成增量备份');
  }

  async function backup(){
    if(backupInFlight){toast('备份正在准备中，请不要重复点击。');return;}
    backupInFlight=true;
    const button=document.getElementById('backupWeeklyStateBtn');
    const normalLabel=button?.textContent||'备份本周标记';
    if(button){button.disabled=true;button.textContent='检查备份…';}
    setCloudStatus('正在检查新的标记…');
    const reserved=reserveBackupWindow();
    try{
      await ensureValidatedPassphrase();
      const metaDoc=await fetchCloudMeta();
      const candidates=deltaCandidates(cloudCursor(metaDoc));
      if(!candidates.length){
        closeReservedWindow(reserved);
        localStorage.removeItem(DIRTY_SINCE_KEY);
        setCloudStatus('云端已是最新 · 无需重复备份');
        if(button){
          button.textContent='已备份 ✓';
          setTimeout(()=>{if(!backupInFlight&&button.textContent==='已备份 ✓')button.textContent=normalLabel;},2400);
        }
        toast('云端已经是最新，没有新的标记需要备份。');
        return;
      }
      if(button)button.textContent='打开确认页…';
      const built=await buildDeltaIssue(metaDoc,candidates);
      localStorage.setItem(BACKUP_PENDING_KEY,built.env.created_at||new Date().toISOString());
      setCloudStatus('备份请求待确认');
      navigateBackupWindow(reserved,built.url);
      const remain=built.total-built.count;
      toast(remain>0?`已准备 ${built.count} 条增量备份。提交后还有 ${remain} 条，下次再点一次备份即可。`:`已准备 ${built.count} 条增量备份。GitHub 页面只需点 Submit。`);
    }catch(e){
      closeReservedWindow(reserved);
      setCloudStatus('备份未完成');
      toast('备份失败：'+e.message);
    }finally{
      backupInFlight=false;
      if(button){button.disabled=false;if(button.textContent!=='已备份 ✓')button.textContent=normalLabel;}
    }
  }

  async function fetchDeltaEnvelopes(metaDoc){
    const deltas=Array.isArray(metaDoc?.meta?.deltas)?metaDoc.meta.deltas:[];
    const results=await Promise.all(deltas.map(async d=>{
      const path=typeof d==='string'?d:d?.path;
      if(!path)return null;
      try{return await fetchJson(path,{optional:true});}catch(_){return null;}
    }));
    return results.filter(Boolean);
  }

  function mergeRemoteState(target,incoming){
    for(const [id,rv] of Object.entries(incoming||{})){
      if(!rv||typeof rv!=='object')continue;
      const remoteTs=Number(rv.updated_at||0),localTs=Number(target[id]?.updated_at||0);
      if(!target[id]||remoteTs>localTs)target[id]={...rv,updated_at:remoteTs};
    }
  }

  async function restore(){
    try{
      const [baseEnv,metaDoc]=await Promise.all([fetchCloudEnvelope(),fetchCloudMeta()]);
      if(!baseEnv){toast('目前还没有云端备份。');return;}
      const deltaEnvs=await fetchDeltaEnvelopes(metaDoc);
      const remote={};
      const basePayload=await decryptPrivateEnvelopeData(baseEnv,{prompt:true});
      if(basePayload?.state&&typeof basePayload.state==='object')mergeRemoteState(remote,basePayload.state);
      for(const env of deltaEnvs){
        const payload=await decryptPrivateEnvelopeData(env,{prompt:true});
        if(payload?.rows)mergeRemoteState(remote,decodeRows(payload.rows));
        else if(payload?.state&&typeof payload.state==='object')mergeRemoteState(remote,payload.state);
      }
      let applied=0,keptLocal=0;
      for(const [id,rv] of Object.entries(remote)){
        const remoteTs=Number(rv.updated_at||0),lv=state[id],localTs=Number(lv?.updated_at||0);
        if(!lv||remoteTs>localTs){state[id]={...rv,updated_at:remoteTs};applied++;}else keptLocal++;
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
    const backupBtn=document.createElement('button');backupBtn.id='backupWeeklyStateBtn';backupBtn.className='btn';backupBtn.type='button';backupBtn.textContent='备份本周标记';backupBtn.onclick=backup;
    const restoreBtn=document.createElement('button');restoreBtn.className='btn secondary';restoreBtn.type='button';restoreBtn.textContent='恢复云端';restoreBtn.onclick=restore;
    const status=document.createElement('span');status.id='weeklyCloudStatus';status.className='muted small';status.textContent='检查保存状态…';
    const help=document.createElement('span');help.className='muted small';help.textContent='备份只提交本周新增/变更记录；打开 GitHub 后直接点 Submit 即可。';
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
