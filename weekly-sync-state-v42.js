// Shared by the reader, Edge Function and tests. No credentials or private data.
(function(root){
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v||{},k);
  const timestamp=v=>Number.isFinite(Number(v))?Math.max(0,Math.floor(Number(v))):0;
  const statuses=new Set(['new','later','read','save','skip']);
  const feedbacks=new Set(['accurate','more','bad','less']);
  function normalize(v){
    if(!v||typeof v!=='object'||Array.isArray(v))return null;
    const updated=timestamp(v.updated_at);
    const out={status:statuses.has(v.status)?v.status:'new',feedback:feedbacks.has(v.feedback)?v.feedback:null,
      feedback_reason:typeof v.feedback_reason==='string'?v.feedback_reason.slice(0,80):null,
      status_origin:typeof v.status_origin==='string'?v.status_origin.slice(0,40):null,
      status_action:typeof v.status_action==='string'?v.status_action.slice(0,40):null,
      updated_at:updated,status_updated_at:timestamp(v.status_updated_at||updated),
      feedback_updated_at:timestamp(own(v,'feedback_updated_at')?v.feedback_updated_at:updated),
      feedback_reason_updated_at:timestamp(v.feedback_reason_updated_at||updated),later_interest_at:timestamp(v.later_interest_at)};
    if(['read','save'].includes(out.status)&&out.status_origin!=='human_v10')out.status='new';
    return out;
  }
  const GROUPS=[['status_updated_at',['status','status_origin','status_action']],['feedback_updated_at',['feedback']],['feedback_reason_updated_at',['feedback_reason']]];
  function meaningful(v){const n=normalize(v);return n&&(n.updated_at>0||n.status!=='new'||n.feedback||n.feedback_reason||n.later_interest_at);}
  function groupKey(v,fields){return JSON.stringify(fields.map(k=>v[k]??null));}
  function mergeRecord(a,b){
    a=normalize(a);b=normalize(b);if(!a)return b;if(!b)return a;
    const out={...a,updated_at:Math.max(a.updated_at,b.updated_at),later_interest_at:Math.max(a.later_interest_at,b.later_interest_at)};
    for(const [clock,fields] of GROUPS){
      let winner=b[clock]>a[clock]||b[clock]===a[clock]&&groupKey(b,fields)>groupKey(a,fields)?b:a;
      // Legacy feedback processing is not an explicit removal of a saved Later bookmark.
      if(clock==='status_updated_at'&&a.status==='later'&&b.status!=='later'&&b.status_action!=='status')winner=a;
      if(clock==='status_updated_at'&&b.status==='later'&&a.status!=='later'&&a.status_action!=='status')winner=b;
      for(const field of fields)out[field]=winner[field];out[clock]=winner[clock];
    }
    return out;
  }
  function normalizeMap(state){const out={};for(const [id,v] of Object.entries(state||{}))if(/^[a-zA-Z0-9_-]{1,128}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id)&&meaningful(v))out[id]=normalize(v);return out;}
  function mergeMap(a,b){const out=normalizeMap(a);for(const [id,v] of Object.entries(normalizeMap(b)))out[id]=mergeRecord(out[id],v);return out;}
  function changes(local,remote){const out={};for(const [id,v] of Object.entries(normalizeMap(local)))if(JSON.stringify(mergeRecord(remote?.[id],v))!==JSON.stringify(normalize(remote?.[id])))out[id]=v;return out;}
  const api={normalize,normalizeMap,mergeRecord,mergeMap,changes,GROUPS};root.WeeklySyncMerge=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
