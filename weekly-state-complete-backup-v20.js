// Weekly v20.1: complete encrypted backup for all local fields that affect reading state or recommendation learning.
// Keeps schema-4 restore compatibility while adding feedback_reason + feedback_reason_updated_at.
(() => {
  const REPO='syukaisan-lang/weekly-intelligence';
  const CLOUD_URL='data/weekly-state.enc.json';
  const CLOUD_META_URL='data/weekly-state.json';
  const BACKUP_PENDING_KEY='weekly_intelligence_backup_pending_v1';
  const DIRTY_SINCE_KEY='weekly_intelligence_dirty_since_v1';
  const MIGRATION_KEY='weekly_intelligence_backup_schema_v20';
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const BACKUP_WINDOW_NAME='weeklyStateBackupConfirm';
  const MAX_DELTA_ENTRIES=200;
  const MAX_ISSUE_URL_LENGTH=7500;
  let backupInFlight=false;

  const STATUS_TO_CODE={new:'n',later:'l',read:'r',save:'s',skip:'k'};
  const CODE_TO_STATUS={n:'new',l:'later',r:'read',s:'save',k:'skip'};
  const FEEDBACK_TO_CODE={accurate:'a',more:'m',bad:'b',less:'l'};
  const CODE_TO_FEEDBACK={a:'accurate',m:'more',b:'bad',l:'less'};
  const ACTION_TO_CODE={feedback:'f',status:'s'};
  const CODE_TO_ACTION={f:'feedback',s:'status'};
  const REASON_TO_CODE={
    evidence:'e',novelty:'n',work_direct:'w',reusable:'r',consumer:'c',japan_market:'j',ai_practical:'i',knowledge_delta:'k',
    too_generic:'g',promo:'p',not_work:'o',known:'d',no_evidence:'x',topic:'t'
  };
  const CODE_TO_REASON=Object.fromEntries(Object.entries(REASON_TO_CODE).map(([k,v])=>[v,k]));

  function toast(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),6500);
  }
  function setCloudStatus(text){const el=document.getElementById('weeklyCloudStatus');if(el)el.textContent=text;}
  function normalizedBackupStatus(v){
    const status=v?.status||'new';
    if((status==='read'||status==='save')&&v?.status_origin!==TRUSTED_STATUS_ORIGIN)return 'new';
    return status;
  }
  function stateItem(v){
    const status=normalizedBackupStatus(v),feedback=v?.feedback??null,reason=v?.feedback_reason||null;
    const item={status,feedback,updated_at:Number(v?.updated_at||0)};
    if(v?.status_origin)item.status_origin=v.status_origin;
    if(v?.status_action)item.status_action=v.status_action;
    if(v?.status_updated_at)item.status_updated_at=Number(v.status_updated_at||0);
    if(reason)item.feedback_reason=reason;
    if(v?.feedback_reason_updated_at)item.feedback_reason_updated_at=Number(v.feedback_reason_updated_at||0);
    return item;
  }
  function meaningfulEntries(){
    const out={};
    for(const [id,v] of Object.entries(state||{})){
      if(!v||typeof v!=='object')continue;
      const item=stateItem(v);
      if(item.status==='new'&&item.feedback===null&&!item.feedback_reason)continue;
      out[id]=item;
    }
    return out;
  }
  function migrateExtendedFields(){
    if(localStorage.getItem(MIGRATION_KEY)==='20')return 0;
    const now=Date.now();let seq=0,changed=0;
    for(const [id,v] of Object.entries(state||{})){
      if(!v||typeof v!=='object'||!v.feedback_reason)continue;
      if(!Number(v.feedback_reason_updated_at))v.feedback_reason_updated_at=Number(v.updated_at||0)||now;
      // Old cloud deltas did not contain feedback_reason. Move the record beyond the old cursor once,
      // so existing reasons are included in the next incremental backup rather than only future reasons.
      v.updated_at=now+(seq++);state[id]=v;changed++;
    }
    if(changed){save();localStorage.setItem(DIRTY_SINCE_KEY,String(now));}
    localStorage.setItem(MIGRATION_KEY,'20');
    return changed;
  }
  function compareCursor(a,b){
    const at=Number(a?.ts||0),bt=Number(b?.ts||0);if(at!==bt)return at-bt;
    return String(a?.id||'').localeCompare(String(b?.id||''));
  }
  function latestLocalCursor(){
    let cur={ts:0,id:''};
    for(const [id,v] of Object.entries(meaningfulEntries())){const c={ts:Number(v.updated_at||0),id};if(compareCursor(c,cur)>0)cur=c;}
    return cur;
  }
  async function fetchJson(url,{optional=false}={}){
    const r=await fetch(url,{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
    if(r.status===404&&optional)return null;if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
  }
  async function fetchCloudEnvelope(){return fetchJson(CLOUD_URL,{optional:true});}
  async function fetchCloudMeta(){return (await fetchJson(CLOUD_META_URL,{optional:true}))||{meta:{}};}
  function cloudCursor(metaDoc){
    const meta=metaDoc?.meta||{};
    if(Number(meta.cursor_updated_at||0))return {ts:Number(meta.cursor_updated_at),id:String(meta.cursor_id||'')};
    return {ts:Date.parse(meta.snapshot_at||0)||0,id:'\uffff'};
  }
  function cloudLatestMs(metaDoc,baseEnv){const meta=metaDoc?.meta||{};return Date.parse(meta.latest_at||meta.snapshot_at||baseEnv?.created_at||0)||0;}
  async function refreshCloudStatus(){
    try{
      const [metaDoc,baseEnv]=await Promise.all([fetchCloudMeta(),fetchCloudEnvelope()]);
      const pending=localStorage.getItem(BACKUP_PENDING_KEY),cloudLatest=cloudLatestMs(metaDoc,baseEnv),pendingTs=pending?Date.parse(pending):0;
      if(pending&&cloudLatest>=pendingTs)localStorage.removeItem(BACKUP_PENDING_KEY);
      const dirty=compareCursor(latestLocalCursor(),cloudCursor(metaDoc))>0;
      if(!dirty)localStorage.removeItem(DIRTY_SINCE_KEY);
      if(localStorage.getItem(BACKUP_PENDING_KEY)){setCloudStatus('加密完整备份已提交 · 等待 GitHub 写入');return;}
      if(dirty){setCloudStatus('本机已自动保存 · 有阅读/学习状态待备份');return;}
      if(!baseEnv){setCloudStatus('本机自动保存 · 尚无云端备份');return;}
      setCloudStatus(`完整云备份 ${new Date(cloudLatest||Date.now()).toLocaleString('ja-JP')}`);
    }catch(_){setCloudStatus('本机已保存 · 云备份状态暂时无法读取');}
  }
  async function ensureValidatedPassphrase(){
    if(typeof loadKnowledgeData!=='function')throw new Error('Private knowledge helper is unavailable');
    if(typeof hasKnowledgePassphrase==='function'&&hasKnowledgePassphrase())return true;
    const k=await loadKnowledgeData({prompt:true});if(k?.locked)throw new Error('Dashboard 密码未通过验证');return true;
  }
  function reserveBackupWindow(){
    const win=window.open('about:blank',BACKUP_WINDOW_NAME);
    if(win){try{win.document.title='准备 Weekly 完整备份…';win.document.body.innerHTML='<p style="font-family:sans-serif;padding:24px">正在准备加密完整备份…</p>';}catch(_){}}
    return win;
  }
  function closeReservedWindow(win){if(win&&!win.closed){try{win.close();}catch(_){}}}
  function navigateBackupWindow(win,url){if(win&&!win.closed){try{win.location.replace(url);win.opener=null;return;}catch(_){}}location.href=url;}
  function deltaCandidates(cursor){
    return Object.entries(meaningfulEntries()).map(([id,v])=>({id,v,c:{ts:Number(v.updated_at||0),id}}))
      .filter(x=>compareCursor(x.c,cursor)>0).sort((a,b)=>compareCursor(a.c,b.c));
  }
  function compactRows(items){
    return items.map(({id,v})=>[
      id,STATUS_TO_CODE[v.status]||v.status||'n',v.feedback?(FEEDBACK_TO_CODE[v.feedback]||v.feedback):'',Number(v.updated_at||0),
      v.status_origin===TRUSTED_STATUS_ORIGIN?'h':(v.status_origin||''),ACTION_TO_CODE[v.status_action]||v.status_action||'',Number(v.status_updated_at||0),
      v.feedback_reason?(REASON_TO_CODE[v.feedback_reason]||v.feedback_reason):'',Number(v.feedback_reason_updated_at||0)
    ]);
  }
  function decodeRows(rows){
    const out={};
    for(const row of rows||[]){
      if(!Array.isArray(row)||!row[0])continue;
      // First seven columns are schema-4 compatible. Schema 5 appends reason + reason timestamp.
      const [id,s,f,u,o,a,su,fr,fru]=row;
      const item={status:CODE_TO_STATUS[s]||s||'new',feedback:f?(CODE_TO_FEEDBACK[f]||f):null,updated_at:Number(u||0)};
      if(o)item.status_origin=o==='h'?TRUSTED_STATUS_ORIGIN:o;
      if(a)item.status_action=CODE_TO_ACTION[a]||a;
      if(su)item.status_updated_at=Number(su);
      if(fr)item.feedback_reason=CODE_TO_REASON[fr]||fr;
      if(fru)item.feedback_reason_updated_at=Number(fru);
      out[id]=item;
    }
    return out;
  }
  async function buildDeltaIssue(metaDoc,candidates){
    let count=Math.min(MAX_DELTA_ENTRIES,candidates.length);
    while(count>=1){
      const batch=candidates.slice(0,count),rows=compactRows(batch),through=batch[batch.length-1].c;
      const payload={schema:5,kind:'weekly-reading-delta',created_at:new Date().toISOString(),fields:['status','feedback','status_meta','feedback_reason'],rows};
      const env=await encryptPrivatePayload(payload,{kind:'weekly-state-delta',compress:true});
      env.cursor_updated_at=through.ts;env.cursor_id=through.id;env.entry_count=rows.length;env.backup_schema=5;env.base_snapshot_at=metaDoc?.meta?.snapshot_at||null;
      const encoded=btoa(JSON.stringify(env));
      const title='[WEEKLY-STATE] '+new Date().toISOString().slice(0,19).replace('T',' ');
      const body=`STATE_ENVELOPE_B64: ${encoded}\n\nWeekly Intelligence 完整增量加密备份：阅读状态 + 正负反馈 + 具体反馈原因。内容已自动填好，只需点击 Submit new issue。`;
      const url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      if(url.length<=MAX_ISSUE_URL_LENGTH)return {url,env,count,total:candidates.length};
      if(count===1)throw new Error('单条备份数据异常过大，无法生成 GitHub 确认页');
      // Adjust by the actual encoded URL size instead of repeatedly halving. This normally converges in 1-2 retries.
      const ratio=MAX_ISSUE_URL_LENGTH/url.length;
      const estimated=Math.floor(count*ratio*.92);
      count=Math.max(1,Math.min(count-1,estimated));
    }
    throw new Error('无法生成增量备份');
  }
  async function backup(){
    if(backupInFlight){toast('备份正在准备中，请不要重复点击。');return;}
    backupInFlight=true;const button=document.getElementById('backupWeeklyStateBtn'),normalLabel=button?.textContent||'备份本周标记';
    if(button){button.disabled=true;button.textContent='检查完整备份…';}setCloudStatus('正在检查阅读/学习状态…');const reserved=reserveBackupWindow();
    try{
      await ensureValidatedPassphrase();const metaDoc=await fetchCloudMeta();const candidates=deltaCandidates(cloudCursor(metaDoc));
      if(!candidates.length){closeReservedWindow(reserved);localStorage.removeItem(DIRTY_SINCE_KEY);setCloudStatus('完整云备份已是最新');if(button){button.textContent='已备份 ✓';setTimeout(()=>{if(!backupInFlight&&button.textContent==='已备份 ✓')button.textContent=normalLabel;},2400);}toast('阅读状态、反馈和具体原因都已是最新，无需重复备份。');return;}
      if(button)button.textContent='打开确认页…';const built=await buildDeltaIssue(metaDoc,candidates);localStorage.setItem(BACKUP_PENDING_KEY,built.env.created_at||new Date().toISOString());setCloudStatus('完整备份请求待确认');navigateBackupWindow(reserved,built.url);
      const remain=built.total-built.count;toast(remain>0?`本次已尽量装满：${built.count} 条；提交后仍有 ${remain} 条待备份。`:`本次已一次打包 ${built.count} 条完整增量；GitHub 页面直接点 Submit。`);
    }catch(e){closeReservedWindow(reserved);setCloudStatus('完整备份未完成');toast('备份失败：'+e.message);}
    finally{backupInFlight=false;if(button){button.disabled=false;if(button.textContent!=='已备份 ✓')button.textContent=normalLabel;}}
  }
  async function fetchDeltaEnvelopes(metaDoc){
    const deltas=Array.isArray(metaDoc?.meta?.deltas)?metaDoc.meta.deltas:[];
    const results=await Promise.all(deltas.map(async d=>{const path=typeof d==='string'?d:d?.path;if(!path)return null;try{return await fetchJson(path,{optional:true});}catch(_){return null;}}));return results.filter(Boolean);
  }
  function mergeRemoteState(target,incoming){
    for(const [id,rv] of Object.entries(incoming||{})){
      if(!rv||typeof rv!=='object')continue;const remoteTs=Number(rv.updated_at||0),localTs=Number(target[id]?.updated_at||0);
      if(!target[id]||remoteTs>localTs)target[id]={...rv,updated_at:remoteTs};
    }
  }
  async function restore(){
    try{
      const [baseEnv,metaDoc]=await Promise.all([fetchCloudEnvelope(),fetchCloudMeta()]);if(!baseEnv){toast('目前还没有云端备份。');return;}
      const deltaEnvs=await fetchDeltaEnvelopes(metaDoc),remote={};const basePayload=await decryptPrivateEnvelopeData(baseEnv,{prompt:true});
      if(basePayload?.state&&typeof basePayload.state==='object')mergeRemoteState(remote,basePayload.state);
      for(const env of deltaEnvs){const payload=await decryptPrivateEnvelopeData(env,{prompt:true});if(payload?.rows)mergeRemoteState(remote,decodeRows(payload.rows));else if(payload?.state&&typeof payload.state==='object')mergeRemoteState(remote,payload.state);}
      let applied=0,keptLocal=0;for(const [id,rv] of Object.entries(remote)){const remoteTs=Number(rv.updated_at||0),lv=state[id],localTs=Number(lv?.updated_at||0);if(!lv||remoteTs>localTs){state[id]={...rv,updated_at:remoteTs};applied++;}else keptLocal++;}
      save();if(typeof rebuildPrefs==='function')rebuildPrefs();if(typeof render==='function')render();if(typeof updateProgressTabs==='function')updateProgressTabs();localStorage.removeItem(BACKUP_PENDING_KEY);await refreshCloudStatus();toast(`已恢复完整云端状态：更新 ${applied} 条，本机较新的 ${keptLocal} 条保留。`);
    }catch(_){toast('恢复失败：密码不正确或备份无法读取。');}
  }
  function install(){
    const tools=document.getElementById('weeklyStateTools'),backupBtn=document.getElementById('backupWeeklyStateBtn');if(!tools||!backupBtn)return false;
    backupBtn.onclick=backup;
    const restoreBtn=[...tools.querySelectorAll('button')].find(b=>b!==backupBtn&&/恢复云端/.test(b.textContent||''));if(restoreBtn)restoreBtn.onclick=restore;
    const help=[...tools.querySelectorAll('span')].find(x=>x.id!=='weeklyCloudStatus');if(help)help.textContent='完整备份：阅读状态、正负反馈和具体原因；单次最多尝试200条，并按 GitHub 安全长度自动装满。';
    tools.dataset.backupSchema='5';refreshCloudStatus();return true;
  }

  const migrated=migrateExtendedFields();
  if(!install()){
    const timer=setInterval(()=>{if(install())clearInterval(timer);},120);setTimeout(()=>clearInterval(timer),5000);
  }
  if(migrated)setTimeout(()=>toast(`已发现 ${migrated} 条旧的具体反馈原因，已加入下一次完整备份。`),500);
  window.weeklyStateCompleteBackupV20={meaningfulEntries,decodeRows,refreshCloudStatus};
})();