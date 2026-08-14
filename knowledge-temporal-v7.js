// Temporal Knowledge v7: semantic retrieval + evidence-time timeline.
(() => {
  const TEMPORAL_RE=/(变化|變化|趋势|趨勢|演变|演變|变迁|變遷|过去|過去|近\s*\d+\s*年|这几年|這幾年|近年来|近年|怎么变|如何变|推移|トレンド|変化|変遷|現在|现在|如今|最新)/i;
  const STRIP_RE=/(变化|變化|趋势|趨勢|演变|演變|变迁|變遷|过去|過去|近\s*\d+\s*年|这几年|這幾年|近年来|近年|怎么变|如何变|推移|トレンド|変化|変遷|現在|现在|如今|最新)/gi;
  const FACETS=[
    ['价格/节约',/価格|値上げ|節約|コスパ|支出|物価|安さ|価格重視|省钱|性价比/i],
    ['品质/安心',/品質|信頼|安心|安全|ブランド|耐久|高品質|质量|信任/i],
    ['便利/省时',/利便|便利|時短|簡単|手軽|効率|省时|便捷/i],
    ['体验/自我',/体験|経験|自分らしさ|個性|趣味|ウェルビーイング|体验|个性/i],
    ['环境/社会',/環境|サステナ|持続可能|社会課題|エシカル|环保|可持续/i],
    ['数字化渠道',/EC|オンライン|SNS|アプリ|デジタル|AI|検索|电商|线上/i]
  ];
  let index=null,packed=null,worker=null,seq=0,pending=new Map(),timer=null,lastQuery='';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  function decode(s){const b=atob(s||''),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Int8Array(u.buffer)}
  function ensurePanel(){
    let el=document.getElementById('knowledgeTemporalPanel');if(el)return el;
    const toolbar=document.querySelector('.knowledge-toolbar');if(!toolbar)return null;
    el=document.createElement('section');el.id='knowledgeTemporalPanel';el.className='card temporal-panel hidden';
    el.innerHTML='<div class="section-head slim"><div><div class="eyebrow">TEMPORAL VIEW</div><h2>时间视角</h2><p class="muted small">按证据发生时间组织语义相关 Knowledge。优先使用调查期，其次发布日期，最后才用 Notion 收录日。</p></div></div><div id="temporalStatus" class="muted small"></div><div id="temporalSummary"></div><div id="temporalTimeline" class="temporal-timeline"></div>';
    toolbar.insertAdjacentElement('afterend',el);
    const st=document.createElement('style');st.textContent=`
      .temporal-panel{margin-top:16px}.temporal-panel.hidden{display:none}.temporal-summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}.temporal-stat{border:1px solid var(--viz-border,rgba(127,127,127,.25));border-radius:12px;padding:10px}.temporal-stat b{display:block;font-size:1.1rem}.temporal-timeline{display:grid;gap:10px;margin-top:12px}.temporal-row{display:grid;grid-template-columns:90px 1fr;gap:12px;align-items:start;border-top:1px solid var(--viz-border,rgba(127,127,127,.22));padding-top:10px}.temporal-date{font-weight:600}.temporal-evidence{display:grid;gap:5px}.temporal-evidence a{font-weight:600;text-decoration:none}.temporal-badges{display:flex;gap:6px;flex-wrap:wrap}.temporal-badge{font-size:.78rem;border:1px solid currentColor;border-radius:999px;padding:2px 7px;opacity:.8}.temporal-facets{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.temporal-facet{font-size:.82rem;padding:4px 8px;border-radius:999px;background:var(--viz-accent-bg,rgba(127,127,127,.12))}.temporal-note{margin-top:10px}.temporal-snippet{margin:0;color:inherit;opacity:.82}.temporal-low{opacity:.68}@media(max-width:560px){.temporal-row{grid-template-columns:1fr}.temporal-date{display:flex;gap:8px;align-items:center}}
    `;document.head.appendChild(st);return el;
  }
  async function ensureIndex(){if(index)return index;const x=await loadEncryptedData('data/semantic-index.json','data/semantic-index.enc.json',{prompt:false});if(!x||x.locked||!x.entries)throw new Error('请先解锁 Knowledge');index=x;packed=decode(x.vectors_b64);return x}
  function ensureWorker(){if(worker)return worker;worker=new Worker('semantic-worker.bundle.js',{type:'module'});worker.onmessage=e=>{const m=e.data||{},p=pending.get(m.id);if(!p)return;if(m.type==='embedding'){pending.delete(m.id);p.resolve(m.vector instanceof Float32Array?m.vector:Float32Array.from(m.vector||[]))}else if(m.type==='error'){pending.delete(m.id);p.reject(new Error(m.error||'embedding failed'))}};return worker}
  function embed(text){const w=ensureWorker(),id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});w.postMessage({type:'embed',id,text})})}
  function score(vector){const dim=Number(index?.meta?.dimension||0),entries=index?.entries||[],scales=index?.scales||[],best=new Map();for(let i=0;i<entries.length;i++){const e=entries[i];if(e.kind!=='notion')continue;let dot=0,off=i*dim,scale=Number(scales[i]||0);for(let j=0;j<dim;j++)dot+=vector[j]*packed[off+j]*scale;const old=best.get(String(e.id||''));if(!old||dot>old.sim)best.set(String(e.id||''),{sim:dot,snippet:e.snippet||''})}const arr=[...best.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.sim-a.sim);const top=arr[0]?.sim||0,cut=Math.max(.64,top-.105);return arr.filter(x=>x.sim>=cut).slice(0,18)}
  function tmeta(a){const ev=a.evidence_period||null,pub=a.published_at||null,col=a.collected_at||a.date||null;let effective=a.effective_date||ev?.end||pub||col||'',confidence=a.temporal_confidence||(ev?'high':pub?'medium':'low'),basis=a.temporal_basis||(ev?'explicit_evidence_period':pub?'published_at':'collected_at_fallback');return{effective,confidence,basis,label:ev?.label||effective}}
  function snippet(a,hit){return String(hit?.snippet||a.summary||a.page_body||'').replace(/\s+/g,' ').trim().slice(0,260)}
  function confidenceLabel(x){return x==='high'?'高：调查/数据期':x==='medium'?'中：发布日期':'低：仅收录日'}
  function facetDelta(rows){
    const dated=rows.filter(x=>x.tm.effective);if(dated.length<4)return[];const sorted=[...dated].sort((a,b)=>a.tm.effective.localeCompare(b.tm.effective)),n=Math.max(2,Math.floor(sorted.length/3)),early=sorted.slice(0,n),late=sorted.slice(-n),out=[];
    for(const [name,re] of FACETS){const ec=early.filter(x=>re.test(`${x.a.title||''} ${x.a.summary||''} ${x.a.page_body||''}`)).length,lc=late.filter(x=>re.test(`${x.a.title||''} ${x.a.summary||''} ${x.a.page_body||''}`)).length,d=lc/n-ec/n;if(Math.abs(d)>=.25)out.push(`${name}${d>0?' ↑':' ↓'}`)}return out.slice(0,4)
  }
  function render(query,rows){
    const panel=ensurePanel();if(!panel)return;panel.classList.remove('hidden');const status=document.getElementById('temporalStatus'),sum=document.getElementById('temporalSummary'),tl=document.getElementById('temporalTimeline');
    if(!rows.length){status.textContent='没有找到足够相关的时间证据。';sum.innerHTML='';tl.innerHTML='';return}
    rows.sort((a,b)=>(a.tm.effective||'9999').localeCompare(b.tm.effective||'9999'));
    const strong=rows.filter(x=>x.tm.confidence!=='low'),years=[...new Set(rows.map(x=>String(x.tm.effective||'').slice(0,4)).filter(Boolean))],facets=facetDelta(rows),first=years[0]||'—',last=years.at(-1)||'—';
    status.textContent=`“${query}” · 找到 ${rows.length} 条语义相关证据，${strong.length} 条具备中/高时间置信度。`;
    sum.innerHTML=`<div class="temporal-summary-grid"><div class="temporal-stat"><span class="muted small">覆盖时间</span><b>${esc(first)} → ${esc(last)}</b></div><div class="temporal-stat"><span class="muted small">有效年份</span><b>${years.length}</b></div><div class="temporal-stat"><span class="muted small">强时间证据</span><b>${strong.length}/${rows.length}</b></div></div>${facets.length?`<div><b>变化信号</b><div class="temporal-facets">${facets.map(x=>`<span class="temporal-facet">${esc(x)}</span>`).join('')}</div><p class="muted small temporal-note">↑/↓ 代表相关证据中该主题出现频率的变化，只用于提示可能的变化方向，不等于同口径统计指标发生了同幅度变化。</p></div>`:''}`;
    tl.innerHTML=rows.map(x=>{const a=x.a,tm=x.tm,low=tm.confidence==='low'?' temporal-low':'';return `<div class="temporal-row${low}"><div class="temporal-date">${esc((tm.effective||'时间不明').slice(0,7))}</div><div class="temporal-evidence"><div class="temporal-badges"><span class="temporal-badge">${esc(confidenceLabel(tm.confidence))}</span><span class="temporal-badge">语义 ${x.hit.sim.toFixed(2)}</span>${a.time_domain?`<span class="temporal-badge">${esc(a.time_domain)}</span>`:''}</div><a href="${esc(a.url||'#')}" target="_blank" rel="noopener noreferrer">${esc(a.title||'Knowledge')}</a><p class="temporal-snippet">${esc(snippet(a,x.hit))}</p></div></div>`}).join('');
  }
  async function run(q){const panel=ensurePanel();if(!panel)return;document.getElementById('temporalStatus').textContent='正在本机做语义时间检索…';document.getElementById('temporalSummary').innerHTML='';document.getElementById('temporalTimeline').innerHTML='';try{await ensureIndex();const core=q.replace(STRIP_RE,' ').replace(/\s+/g,' ').trim()||q,vec=await embed(core),hits=score(vec),map=new Map((K.items||[]).map(a=>[String(a.id||''),a])),rows=hits.map(hit=>({hit,a:map.get(hit.id)})).filter(x=>x.a).map(x=>({...x,tm:tmeta(x.a)}));render(q,rows)}catch(e){document.getElementById('temporalStatus').textContent=String(e?.message||e)}}
  function schedule(){const q=(document.getElementById('knowledgeSearch')?.value||'').trim(),panel=ensurePanel();if(!TEMPORAL_RE.test(q)){panel?.classList.add('hidden');lastQuery='';return}if(q===lastQuery)return;lastQuery=q;clearTimeout(timer);timer=setTimeout(()=>run(q),650)}
  function bind(){const input=document.getElementById('knowledgeSearch');if(!input){setTimeout(bind,120);return}ensurePanel();input.addEventListener('input',schedule);input.placeholder='搜索知识库；时间问题例：消费者消费观这几年怎么变了？';schedule()}
  document.addEventListener('DOMContentLoaded',bind);
  window.addEventListener('knowledge-private-ready',()=>{index=null;packed=null;schedule()});
})();
