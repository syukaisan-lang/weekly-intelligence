const assert=require('node:assert/strict');
const policy=require('../weekly-priority-policy.js');
const {apply}=require('./weekly_review_override.cjs');
const rows=require('../data/articles.json').articles;
const now=Date.now();
const find=id=>({...rows.find(a=>a.id===id),first_seen:new Date(now).toISOString()});
const a=find('eb726a7edd4d8b5d5a');
const review={verdict:'brief',source_signature:policy.sourceSignature(a),confidence:'medium',
  reason:'只需公开摘要',evidence:[a.summary.slice(0,30)]};
assert(policy.assess(a).eligible);
assert(apply(a,{[a.id]:review},now));
assert.equal(policy.assess(a).decision,'摘要足够');
assert(!apply(a,{[a.id]:{...review,evidence:['虚构的一段引用不能改变文章排序和分级。']}},now));
assert(policy.assess(a).eligible,'invalid or revoked override cannot leave an old decision');
assert(!apply({...a,summary:a.summary+' changed'},{[a.id]:review},now),'source changes invalidate correction');
assert(!apply({...a,first_seen:'2020-01-01'},{[a.id]:review},now),'historical articles are not modified by recent overrides');
const event=find('f1d3956d3c3fb61199');
assert(!apply(event,{[event.id]:{...review,source_signature:policy.sourceSignature(event),
  verdict:'recommend',use:'用途',gain:'结论',domain:'EC',evidence:[event.content_excerpt.slice(0,30)]}},now));
console.log('Weekly review overrides require verbatim public evidence, current source and window; hard exclusions stay intact.');
