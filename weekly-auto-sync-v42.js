// Automatic feedback sync. Canonical local state remains the durable offline queue.
(()=>{
  const M=window.WeeklySyncMerge,ENDPOINT='https://cjcnjcblipqsyzxvlbus.supabase.co/functions/v1/weekly-sync';
  const KEY='weekly_intelligence_sync_key_v1',SHARED_KEY='event_radar_sync_key_v1',PAUSED='weekly_intelligence_sync_paused_v42';
  const STATE_KEY='weekly_intelligence_state_v1';
  let baseline=M.normalizeMap(state),remote={},busy=false,timer=null,lastPull=0,rerun=false,failures=0,applying=false;
  function getKey(){return localStorage.getItem(PAUSED)==='1'?'':localStorage.getItem(KEY)||localStorage.getItem(SHARED_KEY)||'';}
  function statusText(text){const el=document.getElementById('weeklyAutoSyncStatus');if(el)el.textContent=text;}
  function local(){return M.normalizeMap(state);}
  function beforeSave(id){
    if(applying)return;
    const ids=id?[String(id)]:Object.keys(state||{});
    for(const k of ids){
      const value=state[k];if(!value||typeof value!=='object')continue;
      const old=baseline[k],n=M.normalize(value);if(!n)continue;
      let changed=false;const now=Math.max(Date.now(),Number(old?.updated_at||0)+1,Number(value.updated_at||0));
      for(const [clock,fields] of M.GROUPS){
        if(old&&fields.some(f=>(n[f]??null)!==(old[f]??null))){value[clock]=Math.max(now,Number(value[clock]||0));changed=true;}
        else if(old)value[clock]=old[clock];
      }
      if(!old){
        // Preserve historical dates. Timestamp-free legacy marks sort before modern edits.
        const legacy=Math.max(Number(value.updated_at||0),Number(value.status_updated_at||0),Number(value.feedback_reason_updated_at||0),Number(value.later_interest_at||0),1);
        value.updated_at=legacy;for(const [clock] of M.GROUPS)if(!value[clock])value[clock]=legacy;
      }else if(changed)value.updated_at=now;
      baseline[k]=M.normalize(value);
    }
  }
  function changed(){if(!getKey()){statusText('本机已保存 · 设置同步码后自动跨设备同步');return;}statusText(navigator.onLine===false?'离线 · 已保存在本机，联网后自动同步':'本机已保存 · 待同步');schedule(500);}
  window.weeklyBeforeStateSave=beforeSave;
  window.weeklyAfterStateSave=changed;
  function refreshReader(){
    try{window.weeklyPreferenceMemoryV32?.invalidate?.();window.weeklyFeedbackRuntimeV38?.invalidate?.();window.weeklyLaterManagerV23?.invalidate?.();window.weeklyLaterLearningV27?.invalidate?.();window.weeklyPerformanceV28?.invalidate?.();}catch(_){}
    if(typeof rebuildPrefs==='function')rebuildPrefs();
    if(typeof render==='function')render();
    if(typeof updateProgressTabs==='function')updateProgressTabs();
  }
  function applyRemote(incoming){
    const current=local(),merged=M.mergeMap(current,incoming);if(JSON.stringify(current)===JSON.stringify(merged))return;
    for(const [id,v] of Object.entries(merged))state[id]={...(state[id]||{}),...v};
    applying=true;try{localStorage.setItem(STATE_KEY,JSON.stringify(state));baseline=M.normalizeMap(state);}finally{applying=false;}
    refreshReader();
  }
  async function call(method,payload,key=getKey()){
    const r=await fetch(ENDPOINT,{method,headers:{'content-type':'application/json','x-sync-key':key},body:method==='POST'?JSON.stringify({state:payload}):undefined,cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
    if(r.status===401)throw Error('bad_key');if(!r.ok)throw Error('http_'+r.status);return r.json();
  }
  function schedule(ms=30000){clearTimeout(timer);timer=setTimeout(()=>sync({force:Object.keys(M.changes(local(),remote)).length>0}),ms);}
  async function sync({force=false}={}){
    if(busy){rerun=true;return;}if(!getKey())return;
    if(navigator.onLine===false){statusText('离线 · 已保存在本机，联网后自动同步');return;}
    if(document.hidden&&!force)return;
    busy=true;rerun=false;const key=getKey();statusText('自动同步 · 正在同步…');
    try{
      remote=(await call('GET',undefined,key)).state||{};if(getKey()!==key)return;applyRemote(remote);
      for(let n=0;n<12;n++){
        const pending=Object.entries(M.changes(local(),remote));if(!pending.length)break;
        const payload=Object.fromEntries(pending.slice(0,150));
        const result=await call('POST',payload,key);if(getKey()!==key)return;
        remote=result.state||{};applyRemote(remote);
      }
      lastPull=Date.now();failures=0;
      const pending=Object.keys(M.changes(local(),remote)).length;
      statusText(pending?'本机已保存 · 正在继续同步…':'自动同步 · 已同步 '+new Date(lastPull).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}));
      schedule(pending?500:30000);
    }catch(e){
      failures++;const bad=String(e.message)==='bad_key';
      statusText(bad?'同步码不正确 · 本机记录保留':navigator.onLine===false?'离线 · 已保存在本机，联网后自动同步':'本机已保存 · 云端暂不可用，将自动重试');
      if(!bad)schedule(Math.min(60000,5000*2**Math.min(failures-1,4)));
    }finally{busy=false;if(rerun&&getKey()){rerun=false;schedule(500);}}
  }
  async function bindKey(){
    const input=document.getElementById('weeklySyncCode'),key=input.value.trim();if(!key){statusText('请输入与周末活动相同的同步码');return;}
    statusText('正在验证同步码…');
    try{await call('GET',undefined,key);localStorage.setItem(KEY,key);localStorage.removeItem(PAUSED);input.value='';document.getElementById('weeklySyncSettings').hidden=true;lastPull=0;await sync({force:true});}
    catch(e){statusText(String(e.message)==='bad_key'?'同步码不正确 · 本机记录保留':'无法验证同步码 · 请联网后重试');}
  }
  function mount(){
    const root=document.querySelector('.reading-progress');if(!root)return;
    // Legacy restore helpers stay available only for an explicit import, without old polling UI.
    document.getElementById('weeklyStateTools')?.remove();
    const tools=document.createElement('div');tools.id='weeklyAutoSyncTools';tools.className='controls';tools.style.marginTop='10px';
    tools.innerHTML='<button id="weeklySyncSettingsBtn" class="btn secondary" type="button">同步设置</button><button id="weeklySyncNowBtn" class="text-btn" type="button">立即同步</button><span id="weeklyAutoSyncStatus" class="muted small" role="status" aria-live="polite"></span><details><summary class="muted small">迁移旧备份</summary><p class="muted small">已有云端备份会自动迁移。本机旧标记会在绑定后自动上传；未迁入的加密备份可手动恢复一次。</p><button id="weeklyStateFileRestoreBtn" class="btn secondary" type="button">恢复旧备份</button></details><div id="weeklySyncSettings" hidden><p class="muted small">每台设备设置一次与周末活动相同的同步码。已绑定活动的设备会自动沿用；之后文章状态与反馈自动保存。</p><input id="weeklySyncCode" type="password" autocomplete="off" aria-label="同步码" placeholder="输入活动同步码"><button id="weeklySyncBindBtn" class="btn" type="button">绑定并同步</button><button id="weeklySyncPauseBtn" class="text-btn" type="button">暂停本机同步</button></div>';
    root.appendChild(tools);
    document.getElementById('weeklySyncSettingsBtn').onclick=()=>{const box=document.getElementById('weeklySyncSettings');box.hidden=!box.hidden;if(!box.hidden)document.getElementById('weeklySyncCode').focus();};
    document.getElementById('weeklySyncBindBtn').onclick=bindKey;
    document.getElementById('weeklySyncCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();bindKey();}});
    document.getElementById('weeklySyncNowBtn').onclick=()=>sync({force:true});
    document.getElementById('weeklySyncPauseBtn').onclick=()=>{localStorage.setItem(PAUSED,'1');clearTimeout(timer);statusText('本机同步已暂停 · 标记仍保存在本机');};
    document.getElementById('weeklyStateFileRestoreBtn').onclick=async()=>{await window.weeklyStateIntegrityV22?.restoreAll?.();changed();};
    // Normalize timestamp-free historical feedback once, without treating it as a new user action.
    beforeSave();localStorage.setItem(STATE_KEY,JSON.stringify(state));
    if(getKey())sync({force:true});else statusText('本机已保存 · 设置同步码后自动跨设备同步');
  }
  window.addEventListener('focus',()=>{if(Date.now()-lastPull>15000)sync();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();else if(getKey()&&Object.keys(M.changes(local(),remote)).length)sync({force:true});});
  window.addEventListener('online',()=>sync({force:true}));
  window.addEventListener('storage',e=>{if(e.key===STATE_KEY){try{applyRemote(JSON.parse(e.newValue||'{}'));changed();}catch(_){} }else if([KEY,SHARED_KEY,PAUSED].includes(e.key)){if(getKey())sync({force:true});}});
  window.WeeklyAutoSync={sync,getKey,applyRemote,beforeSave};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
