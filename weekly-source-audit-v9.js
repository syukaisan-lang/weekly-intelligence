// Weekly v11: one-click processing + trusted human state + S/A/B attention queue.
// Explicit human feedback remains the only strong content-training signal.
(() => {
  const NEGATIVE=new Set(['bad','less']);
  const POSITIVE=new Set(['accurate','more']);
  const QUEUE_GRADES=new Set(['S','A','B']);
  const EXPIRE_MS=7*24*60*60*1000;
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const STATUS_ACTION_STATUS='status';
  const STATUS_ACTION_FEEDBACK='feedback';

  const baseSt=st;
  st=function(id){
    const s=baseSt(id)||{status:'new',feedback:null};
    // Legacy read/save records did not record whether the user explicitly chose them.
    if((s.status==='read'||s.status==='save')&&s.status_origin!==TRUSTED_STATUS_ORIGIN){
      return {...s,status:'new',legacy_status:s.status};
    }
    return s;
  };

  const baseSetStatus=setStatus;
  setStatus=function(a,v){
    baseSetStatus(a,v);
    const raw=state?.[a.id]||{};
    if(raw.status===v&&(v==='read'||v==='save'||v==='later'||v==='skip')){
      raw.status_origin=TRUSTED_STATUS_ORIGIN;
      raw.status_action=STATUS_ACTION_STATUS;
      raw.status_updated_at=Date.now();
    }else if(raw.status==='new'){
      delete raw.status_origin;delete raw.status_action;delete raw.status_updated_at;
    }
    state[a.id]=raw;save();
    updateProgressTabs();renderMetrics();renderArticles();
  };

  // A feedback click itself is a processing action. The user should never need to click
  // a feedback button and then click "已读" again. "稍后看" remains explicitly unread.
  const baseFeedback=feedback;
  feedback=function(a,v){
    const effective=st(a.id)||{status:'new'};
    if(effective.status==='new'||effective.status==='later'){
      const raw=state?.[a.id]||{};
      raw.status='read';
      raw.status_origin=TRUSTED_STATUS_ORIGIN;
      raw.status_action=STATUS_ACTION_FEEDBACK;
      raw.status_updated_at=Date.now();
      state[a.id]=raw;save();
    }
    baseFeedback(a,v);
  };

  function currentGrade(a){try{return grade(score(a));}catch(_){return a.grade||'C';}}
  function articleRows(){return Array.isArray(data?.articles)?data.articles:[];}
  function humanState(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function isQueueGrade(a){return QUEUE_GRADES.has(currentGrade(a));}
  function queueTs(a){
    const t=Date.parse(a?.first_seen||a?.published||'');
    return Number.isFinite(t)?t:0;
  }
  function isUnlabeled(a){
    const s=humanState(a),status=s.status||'new';
    return status==='new'&&!s.feedback;
  }
  function isExpiredUnlabeled(a){
    const t=queueTs(a);return isUnlabeled(a)&&!!t&&(Date.now()-t)>=EXPIRE_MS;
  }
  function isAutoArchived(a){
    // C never enters the attention/archive workflow. It remains available only in "全部"
    // for history, dedupe and source-quality learning.
    return isUnlabeled(a)&&isQueueGrade(a)&&isExpiredUnlabeled(a);
  }
  function isRecommendedUnread(a){
    const s=humanState(a),status=s.status||'new';
    if(!isQueueGrade(a))return false;
    if(status==='later')return true;
    if(status!=='new')return false;
    return !isExpiredUnlabeled(a);
  }
  function isRead(a){const x=humanState(a).status;return x==='read'||x==='save';}
  function isSkipped(a){return humanState(a).status==='skip';}
  function isSaved(a){return humanState(a).status==='save';}
  function isMarkedLocal(a){const s=humanState(a);return (s.status&&s.status!=='new')||!!s.feedback;}
  function isPositive(a){return POSITIVE.has(humanState(a).feedback);}
  function isExplicitReadAdoption(a){
    const s=humanState(a);
    return s.status==='read'&&s.status_action===STATUS_ACTION_STATUS&&!NEGATIVE.has(s.feedback);
  }
  function saAdopted(a){
    if(!['S','A'].includes(currentGrade(a)))return false;
    const s=humanState(a);
    return s.status==='save'||isPositive(a)||isExplicitReadAdoption(a);
  }

  function sourceStats(){
    const map=new Map();
    for(const a of articleRows()){
      const name=a.source||'来源不明';
      if(!map.has(name))map.set(name,{source:name,total:0,explicitSkip:0,implicitSkip:0,negative:0,positive:0,sa:0,saAdopted:0,saIgnored:0,bc:0,read:0,explicitRead:0,save:0,unread:0,expired:0,archived:0});
      const r=map.get(name),s=humanState(a),g=currentGrade(a);
      r.total++;
      if(isSkipped(a))r.explicitSkip++;
      if(isUnlabeled(a))r.implicitSkip++;
      if(isExpiredUnlabeled(a)&&isQueueGrade(a))r.expired++;
      if(isAutoArchived(a))r.archived++;
      if(NEGATIVE.has(s.feedback))r.negative++;
      if(POSITIVE.has(s.feedback))r.positive++;
      if(['S','A'].includes(g)){
        r.sa++;
        if(saAdopted(a))r.saAdopted++;
        if(isSkipped(a)||isUnlabeled(a))r.saIgnored++;
      }else r.bc++;
      if(isRead(a))r.read++;
      if(isExplicitReadAdoption(a))r.explicitRead++;
      if(isSaved(a))r.save++;
      if(isRecommendedUnread(a))r.unread++;
    }
    const rows=[...map.values()];
    for(const r of rows){
      r.skip=r.explicitSkip+r.implicitSkip;
      r.skipRate=r.total?r.skip/r.total:0;
      r.explicitSkipRate=r.total?r.explicitSkip/r.total:0;
      r.implicitSkipRate=r.total?r.implicitSkip/r.total:0;
      r.lowRate=r.total?r.bc/r.total:0;
      r.saAdoptionRate=r.sa?r.saAdopted/r.sa:0;
      // Auto-read caused by negative feedback is processing, not positive source value.
      r.valueRate=r.total?(r.save*2+r.explicitRead+r.positive+r.saAdopted*.8)/r.total:0;
      if(r.total>=8&&r.skipRate>=.85&&r.save===0&&r.saAdoptionRate<.15)r.action='建议停用';
      else if(r.total>=8&&r.skipRate>=.70&&r.save===0&&r.saAdoptionRate<.30)r.action='优先审查';
      else if(r.total>=8&&r.lowRate>=.80&&r.save===0&&r.positive===0)r.action='考虑降频';
      else r.action='保留观察';
    }
    return rows.sort((a,b)=>b.skip-a.skip||b.skipRate-a.skipRate||a.saAdoptionRate-b.saAdoptionRate||b.total-a.total||a.source.localeCompare(b.source,'ja'));
  }

  function fmtPct(x){return `${Math.round((x||0)*100)}%`;}
  function escV11(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

  function ensureUi(){
    let note=document.getElementById('autoArchiveNote');
    if(!note){
      const progress=document.querySelector('.reading-progress .reading-progress-head>div');
      if(progress){note=document.createElement('div');note.id='autoArchiveNote';note.className='muted small';note.style.marginTop='4px';progress.appendChild(note);}
    }
    const gf=document.getElementById('gradeFilter');
    if(gf&&!gf.querySelector('option[value="SAB"]')){
      const opt=document.createElement('option');opt.value='SAB';opt.textContent='S + A + B';gf.prepend(opt);
    }
    if(document.getElementById('sourceAuditCard'))return;
    const coverage=document.getElementById('sourceCoverage')?.closest('.card');
    if(!coverage)return;
    const card=document.createElement('section');card.className='card';card.id='sourceAuditCard';
    card.innerHTML=`<div class="section-head slim"><div><h2>来源质量</h2><div id="sourceAuditSummary" class="muted small">读取本机标记…</div></div><div id="sourceAuditPill" class="pill">0 停用候选</div></div>
      <p class="muted small">来源评估中，“未标注”按隐性跳过计算；但不会作为强负反馈训练内容偏好。待处理只保留 S/A/B，C 不进入处理队列。</p>
      <div id="sourceAuditTable" class="source-audit-table"></div>
      <div class="controls" style="margin-top:10px"><button id="copySourceAudit" class="btn secondary" type="button">复制来源统计</button></div>`;
    coverage.insertAdjacentElement('afterend',card);
    const style=document.createElement('style');style.textContent=`
      .source-audit-table{display:grid;gap:8px}.source-audit-row{padding:9px 0;border-top:1px solid var(--line,#ddd)}
      .source-audit-row:first-child{border-top:0}.source-audit-main{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .source-audit-main b{font-size:13px}.source-audit-action{font-size:11px;white-space:nowrap;padding:2px 6px;border-radius:999px;background:rgba(127,127,127,.12)}
      .source-audit-action.danger{font-weight:700}.source-audit-action.warn{font-weight:600}.source-audit-numbers{display:flex;flex-wrap:wrap;gap:5px 10px;margin-top:5px;font-size:11px;opacity:.82}`;
    document.head.appendChild(style);
  }

  function renderSourceAudit(){
    ensureUi();
    const root=document.getElementById('sourceAuditTable');if(!root)return;
    const rows=sourceStats();
    const totals=rows.reduce((o,r)=>{o.total+=r.total;o.skip+=r.skip;o.explicit+=r.explicitSkip;o.implicit+=r.implicitSkip;o.bc+=r.bc;o.sa+=r.sa;o.saAdopted+=r.saAdopted;o.save+=r.save;o.unread+=r.unread;o.expired+=r.expired;o.archived+=r.archived;return o;},{total:0,skip:0,explicit:0,implicit:0,bc:0,sa:0,saAdopted:0,save:0,unread:0,expired:0,archived:0});
    const summary=document.getElementById('sourceAuditSummary');
    if(summary)summary.textContent=`来源评估跳过 ${totals.skip}（显性 ${totals.explicit} + 未标注 ${totals.implicit}）· S/A采纳 ${totals.saAdopted}/${totals.sa} · 当前待处理 ${totals.unread}`;
    root.innerHTML=rows.map(r=>`<div class="source-audit-row" data-source-audit="${escV11(r.source)}">
      <div class="source-audit-main"><b>${escV11(r.source)}</b><span class="source-audit-action ${r.action==='建议停用'?'danger':r.action==='优先审查'?'warn':''}">${r.action}</span></div>
      <div class="source-audit-numbers"><span>来源跳过 <b>${r.skip}</b>/${r.total} (${fmtPct(r.skipRate)})</span><span>显 ${r.explicitSkip}</span><span>隐 ${r.implicitSkip}</span><span>B/C ${r.bc}</span><span>S/A采纳 ${r.saAdopted}/${r.sa}</span><span>过期归档 ${r.archived}</span><span>保存 ${r.save}</span><span>待处理 ${r.unread}</span></div>
    </div>`).join('');
    const pill=document.getElementById('sourceAuditPill');if(pill)pill.textContent=`${rows.filter(r=>r.action==='建议停用').length} 停用候选`;
  }

  async function copyStats(){
    const rows=sourceStats(),tot=rows.reduce((o,r)=>{o.skip+=r.skip;o.explicit+=r.explicitSkip;o.implicit+=r.implicitSkip;return o;},{skip:0,explicit:0,implicit:0});
    const lines=[`Weekly来源统计｜来源评估跳过 ${tot.skip}（显性 ${tot.explicit} + 未标注 ${tot.implicit}）`,'媒体\t来源跳过/总数\t跳过率\t显性\t隐性\tB/C\tS/A采纳\t过期归档\t保存\t待处理\t建议'];
    for(const r of rows)lines.push(`${r.source}\t${r.skip}/${r.total}\t${fmtPct(r.skipRate)}\t${r.explicitSkip}\t${r.implicitSkip}\t${r.bc}\t${r.saAdopted}/${r.sa}\t${r.archived}\t${r.save}\t${r.unread}\t${r.action}`);
    const text=lines.join('\n');
    try{await navigator.clipboard.writeText(text);const b=document.getElementById('copySourceAudit');if(b){const old=b.textContent;b.textContent='已复制';setTimeout(()=>b.textContent=old,1800);}}
    catch(_){window.prompt('复制下面的来源统计：',text);}
  }

  // Queue rules are views only: C is excluded; expired S/A/B remains reviewable in archive.
  const baseVisible=typeof visible==='function'?visible:null;
  if(baseVisible){
    visible=function(a){
      const src=document.getElementById('sourceFilter')?.value||'all';
      const sf=document.getElementById('statusFilter')?.value||'all';
      if(src!=='all'&&a.source!==src)return false;
      const s=humanState(a),status=s.status||'new';
      if(readingProgress==='archive'){
        if(sf!=='all'&&sf!=='new')return false;
        if(!isAutoArchived(a))return false;
        const gf=document.getElementById('gradeFilter')?.value||'SAB',g=currentGrade(a);
        return gf==='ALL'||gf==='SAB'||gf===g||(gf==='SA'&&['S','A'].includes(g));
      }
      if(readingProgress!=='unread')return baseVisible(a);
      if(sf!=='all'&&status!==sf)return false;
      if(!isRecommendedUnread(a))return false;
      const gf=document.getElementById('gradeFilter')?.value||'SAB',g=currentGrade(a);
      if(gf==='S'||gf==='A'||gf==='B')return g===gf;
      if(gf==='SA')return ['S','A'].includes(g);
      return gf==='ALL'||gf==='SAB';
    };
  }

  const baseSyncGrade=typeof syncGradeToProgress==='function'?syncGradeToProgress:null;
  if(baseSyncGrade){
    syncGradeToProgress=function(key){
      baseSyncGrade(key);
      const gf=document.getElementById('gradeFilter');
      if(gf&&(key==='unread'||key==='archive'))gf.value='SAB';
    };
  }

  const baseUpdateProgress=typeof updateProgressTabs==='function'?updateProgressTabs:null;
  updateProgressTabs=function(){
    if(baseUpdateProgress)baseUpdateProgress();
    const arts=articleRows();
    const counts={unread:0,archive:0,marked:0,read:0,skip:0,all:arts.length};
    for(const a of arts){
      if(isRecommendedUnread(a))counts.unread++;
      if(isAutoArchived(a))counts.archive++;
      if(isMarkedLocal(a))counts.marked++;
      if(isRead(a))counts.read++;
      if(isSkipped(a))counts.skip++;
    }
    document.querySelectorAll('[data-progress]').forEach(btn=>{
      const key=btn.dataset.progress,count=btn.querySelector('.segment-count');
      btn.classList.toggle('active',key===readingProgress);
      if(count)count.textContent=counts[key]??0;
    });
    const cCount=arts.filter(a=>isUnlabeled(a)&&currentGrade(a)==='C').length;
    const expired=arts.filter(a=>isAutoArchived(a)).length;
    const note=document.getElementById('autoArchiveNote');if(note)note.textContent=`C 自动排除 ${cCount} 篇；S/A/B 7天未处理归档 ${expired} 篇。`;
  };

  const baseRenderArticles=typeof renderArticles==='function'?renderArticles:null;
  if(baseRenderArticles){renderArticles=function(){baseRenderArticles();updateProgressTabs();renderSourceAudit();};}
  const baseRenderMetrics=typeof renderMetrics==='function'?renderMetrics:null;
  if(baseRenderMetrics){
    renderMetrics=function(){
      baseRenderMetrics();
      const read=articleRows().filter(isRead).length;
      const cards=[...document.querySelectorAll('#metrics .metric')];
      const card=cards.find(x=>x.querySelector('.metric-label')?.textContent==='已读');
      if(card){const v=card.querySelector('.metric-value');if(v)v.textContent=String(read);const sub=card.querySelector('.metric-sub');if(sub)sub.textContent='状态或反馈一次点击即可完成处理';}
      updateProgressTabs();
    };
  }

  function mount(){
    ensureUi();
    // Restore archive across reloads; weekly-progress v2 predates the archive key.
    try{
      const saved=JSON.parse(localStorage.getItem('weekly_intelligence_view_v2')||'{}')||{};
      if(saved.progress==='archive')readingProgress='archive';
    }catch(_){}
    const gf=document.getElementById('gradeFilter');if(gf&&(readingProgress==='unread'||readingProgress==='archive'))gf.value='SAB';
    document.getElementById('copySourceAudit')?.addEventListener('click',copyStats);
    const unreadBtn=document.querySelector('[data-progress="unread"]');
    if(unreadBtn&&unreadBtn.firstChild?.nodeType===Node.TEXT_NODE)unreadBtn.firstChild.textContent='待处理 ';
    renderSourceAudit();updateProgressTabs();renderMetrics();
    if(typeof renderArticles==='function')renderArticles();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  const api={sourceStats,render:renderSourceAudit,copy:copyStats,isRecommendedUnread,isExpiredUnlabeled,isAutoArchived,isQueueGrade};
  window.weeklySourceAuditV10=api;
  window.weeklySourceAuditV11=api;
})();