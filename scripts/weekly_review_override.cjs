// Apply only source-bound corrections for the most recent article window.
// The reviewer cannot alter URLs, article content, scores or private state.
const policy=require('../weekly-priority-policy.js');
const day=86400000;
function apply(a,entries,now){
  if(a.priority_review?.origin==='weekly_public_review')delete a.priority_review;
  const r=Object.hasOwn(entries||{},String(a.id))?entries[a.id]:null;
  const seen=Date.parse(a.first_seen||a.published||'');
  if(!r||!Number.isFinite(seen)||seen<now-7*day||seen>now)return false;
  if(r.source_signature!==policy.sourceSignature(a)||!['recommend','brief','skip'].includes(r.verdict))return false;
  if(!['medium','high'].includes(r.confidence)||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>2)return false;
  const text=[a.summary||'',a.content_excerpt||''];
  if(r.evidence.some(q=>typeof q!=='string'||q.trim().length<12||q.length>220||!text.some(x=>x.includes(q))))return false;
  const field=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
  const review={version:policy.REVIEW_VERSION,source_signature:r.source_signature,two_pass:true,
    verdict:r.verdict,confidence:r.confidence,evidence:r.evidence,use:field(r.use,150),
    gain:field(r.gain,150),reason:field(r.reason,150),domain:field(r.domain,30),
    kind:'public_review',origin:'weekly_public_review'};
  if(!review.reason||r.verdict==='recommend'&&(!review.domain||!review.use||!review.gain))return false;
  if(r.verdict==='recommend'){
    // Corrections may recover uncertain stories. Do not bypass an explicit
    // registration, promotion or basic-content exclusion with a model verdict.
    const baseline=policy.assess({...a,priority_review:undefined});
    if(!baseline.eligible&&baseline.decision!=='待核验')return false;
  }
  a.priority_review=review;return true;
}
module.exports={apply};
