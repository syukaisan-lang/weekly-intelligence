// Weekly v22.2: field-level state integrity. Later is an explicit bookmark and feedback must not overwrite it.
// Schema-6 Later-interest history is preserved during explicit encrypted restore.
(() => {
  const BASE_URL='data/weekly-state.enc.json';
  const META_URL='data/weekly-state.json';
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const CODE_TO_STATUS={n:'new',l:'later',r:'read',s:'save',k:'skip'};
  const CODE_TO_FEEDBACK={a:'accurate',m:'more',b:'bad',l:'less'};
  const CODE_TO_ACTION={f:'feedback',s:'status'};
  const CODE_TO_REASON={e:'evidence',n:'novelty',w:'work_direct',r:'reusable',c:'consumer',j:'japan_market',i:'ai_practical',k:'knowledge_delta',g:'too_generic',p:'promo',o:'not_work',d:'known',x:'no_evidence',t:'topic'};
  let recovering=false;

  function toast(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),6500);
  }
  async function fetchJson(url,{optional=false}={}){
    const r=await fetch(url,{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
    if(r.status===404&&optional)return null;if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
  }
  function decodeRows(rows){
    const out={};
    for(const row of rows||[]){
      if(!Array.isArray(row)||!row[0])continue;
      // schema 4: first 7 fields; schema 5: feedback reason; schema 6: later_interest_at.
      const [id,s,f,u,o,a,su,fr,fru,lia]=row;
      const item={status:CODE_TO_STATUS[s]||s||'new',feedback:f?(CODE_TO_FEEDBACK[f]||f):null,updated_at:Number(u||0)};
      if(o)item.status_origin=o==='h'?TRUSTED_STATUS_ORIGIN:o;
      if(a)item.status_action=CODE_TO_ACTION[a]||a;
      if(su)item.status_updated_at=Number(su);
      if(fr)item.feedback_reason=CODE_TO_REASON[fr]||fr;
      if(fru)item.feedback_reason_updated_at=Number(fru);
      if(lia)item.later_interest_at=Number(lia);
      out[id]=item;
    }
    return out;
  }
  function statusTs(v){return Number(v?.status_updated_at||v?.updated_at||0);}
  function explicitStatus(v){
    if(!v||typeof v!=='object')return false;
    if(v.status==='later')return true;
    if(v.status_action==='status')return true;
    // Compatibility for genuinely old manual read/save/skip records created before status_action existed.
    if(!v.status_action&&!v.feedback&&['read','save','skip'].includes(v.status))return true;
    return false;
  }
  function mergeRecord(prev,next){
    if(!prev)return {...next};
    if(!next)return {...prev};
    const pt=Number(prev.updated_at||0),nt=Number(next.updated_at||0);
    const newer=nt>=pt?next:prev,older=nt>=pt?prev:next;
    let out={...older,...newer,updated_at:Math.max(pt,nt)};

    // Feedback/reason updates are independent from the human reading-status timeline.
    const prevStatusTs=statusTs(prev),nextStatusTs=statusTs(next);
    let chosenStatus=prev;
    if(next.status==='later'&&nextStatusTs>=prevStatusTs)chosenStatus=next;
    else if(prev.status==='later'&&next.status!=='later'){
      // A feedback-only migration (read->new, positive_feedback_only, reason migration, etc.)
      // is not allowed to destroy an explicit Later bookmark.
      if(explicitStatus(next)&&nextStatusTs>prevStatusTs)chosenStatus=next;
      else chosenStatus=prev;
    }else if(explicitStatus(next)&&nextStatusTs>=prevStatusTs)chosenStatus=next;
    else if(!explicitStatus(prev)&&nextStatusTs>=prevStatusTs)chosenStatus=next;

    out.status=chosenStatus.status||'new';
    if(chosenStatus.status_origin)out.status_origin=chosenStatus.status_origin;else delete out.status_origin;
    if(chosenStatus.status_action)out.status_action=chosenStatus.status_action;else delete out.status_action;
    if(statusTs(chosenStatus))out.status_updated_at=statusTs(chosenStatus);else delete out.status_updated_at;
    // later_interest_at is learning history, not the current status. Preserve the newest/highest known
    // timestamp even if the current explicit status later becomes read/skip/save.
    const laterInterest=Math.max(Number(prev.later_interest_at||0),Number(next.later_interest_at||0));
    if(laterInterest)out.later_interest_at=laterInterest;else delete out.later_interest_at;
    return out;
  }
  function mergeMap(target,incoming){
    for(const [id,v] of Object.entries(incoming||{}))if(v&&typeof v==='object')target[id]=mergeRecord(target[id],v);
  }
  async function remoteTimeline(){
    const [baseEnv,metaDoc]=await Promise.all([fetchJson(BASE_URL,{optional:true}),fetchJson(META_URL,{optional:true})]);
    if(!baseEnv)return {remote:{},metaDoc};
    if(typeof decryptPrivateEnvelopeData!=='function')throw new Error('加密恢复组件未加载');
    const remote={};
    const base=await decryptPrivateEnvelopeData(baseEnv,{prompt:true});
    if(base?.state&&typeof base.state==='object')mergeMap(remote,base.state);
    const deltas=Array.isArray(metaDoc?.meta?.deltas)?[...metaDoc.meta.deltas]:[];
    deltas.sort((a,b)=>String(a?.created_at||'').localeCompare(String(b?.created_at||'')));
    for(const d of deltas){
      const path=typeof d==='string'?d:d?.path;if(!path)continue;
      const env=await fetchJson(path,{optional:true});if(!env)continue;
      const payload=await decryptPrivateEnvelopeData(env,{prompt:true});
      if(payload?.rows)mergeMap(remote,decodeRows(payload.rows));
      else if(payload?.state&&typeof payload.state==='object')mergeMap(remote,payload.state);
    }
    return {remote,metaDoc};
  }
  function applyRemote(remote,{laterOnly=false}={}){
    let restoredLater=0,updated=0;
    for(const [id,rv] of Object.entries(remote||{})){
      if(laterOnly&&rv?.status!=='later')continue;
      const before=state?.[id]||null;
      const merged=mergeRecord(rv,before); // local is considered the newest event, but feedback-only local changes cannot erase remote Later.
      if(laterOnly&&merged.status!=='later')continue;
      const changed=JSON.stringify(before||{})!==JSON.stringify(merged);
      if(changed){
        if((before?.status||'new')!=='later'&&merged.status==='later')restoredLater++;
        state[id]=merged;updated++;
      }
    }
    if(updated&&typeof save==='function')save();
    if(updated){
      if(typeof rebuildPrefs==='function')rebuildPrefs();
      if(typeof render==='function')render();else if(typeof renderArticles==='function')renderArticles();
      if(typeof updateProgressTabs==='function')updateProgressTabs();
    }
    return {restoredLater,updated};
  }
  async function recoverHistoricalLater(){
    if(recovering)return {restoredLater:0,updated:0};
    recovering=true;
    try{
      const {remote}=await remoteTimeline();
      const result=applyRemote(remote,{laterOnly:true});
      if(result.restoredLater)toast(`已从加密历史恢复 ${result.restoredLater} 条“稍后看”。`);
      return result;
    }finally{recovering=false;}
  }
  async function restoreAll(){
    if(recovering)return;
    recovering=true;
    try{
      const {remote}=await remoteTimeline();
      const result=applyRemote(remote,{laterOnly:false});
      toast(`已按字段合并云端状态：更新 ${result.updated} 条；Later 书签和 Later 兴趣历史不会被反馈记录覆盖。`);
    }catch(e){toast('恢复失败：'+(e?.message||'密码不正确或备份无法读取。'));}
    finally{recovering=false;}
  }

  // Future status changes get their own timestamp/provenance so feedback and status can be merged independently.
  if(typeof setStatus==='function'){
    const previousSetStatus=setStatus;
    window.setStatus=setStatus=function(a,v){
      const out=previousSetStatus(a,v),now=Date.now(),cur=state?.[a.id]||{};
      cur.status_origin=TRUSTED_STATUS_ORIGIN;cur.status_action='status';cur.status_updated_at=now;cur.updated_at=Math.max(Number(cur.updated_at||0),now);state[a.id]=cur;
      if(typeof save==='function')save();
      return out;
    };
  }

  function bind(){
    // Opening Later is navigation only. Encrypted remote recovery is reserved for the explicit
    // “恢复云端” action; do not attach any recovery listener to the Later tab.
    const tools=document.getElementById('weeklyStateTools');
    const restore=tools?[...tools.querySelectorAll('button')].find(b=>/恢复云端/.test(b.textContent||'')):null;
    if(restore&&!restore.dataset.integrityV22){restore.dataset.integrityV22='1';restore.onclick=restoreAll;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
  const timer=setInterval(()=>{bind();if(document.getElementById('weeklyStateTools'))clearInterval(timer);},150);setTimeout(()=>clearInterval(timer),5000);

  window.weeklyStateIntegrityV22={recoverHistoricalLater,restoreAll,mergeRecord,remoteTimeline};
})();
