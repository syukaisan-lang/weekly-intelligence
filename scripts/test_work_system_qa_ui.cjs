// Execute the real UI handlers with a small DOM adapter and mock HTTP responses.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Q=require('../work-system-qa-core.js'),script=fs.readFileSync(path.join(__dirname,'..','work-system-qa.js'),'utf8');
function app(sharedStorage=new Map([['weekly_intelligence_sync_key_v1','test-sync-code']])){
 const nodes=new Map(),requests=[],state={focus:'',badModels:false};
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.textContent='';this.classList={add(){},remove(){},contains(){return false;}};}
  set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
  set innerHTML(html){
   for(const m of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(m[1]);e.id=m[2];e.hidden=/\shidden(?:\s|>)/.test(m[0]);e.disabled=/\sdisabled(?:\s|>)/.test(m[0]);this.children.push(e);}
   nodes.get('qaProvider').value='openai';nodes.get('qaScope').value='combined';
  }
  append(...children){this.children.push(...children);}appendChild(child){this.append(child);}replaceChildren(...children){this.children=[...children];if(this.tag==='select')this.value=children[0]?.value||'';}
  before(){}focus(){state.focus=this.id||'';}scrollIntoView(){}select(){}setAttribute(name,value){this[name]=value;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  descendants(){return this.children.flatMap(e=>[e,...(e.descendants?e.descendants():[])]);}
  querySelector(selector){const ref=selector.match(/data-ref="([^"]+)"/)?.[1];return this.descendants().find(e=>e.tag==='input'&&e.dataset.ref===ref)||null;}
 }
 const gate=new Element();gate.id='workSystemGate';
 const document={readyState:'complete',getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),addEventListener(){}};
 const response=body=>({ok:true,status:200,json:async()=>body});
 const context={console,Date,Math,JSON,Number,String,Array,Object,Set,Map,URL,AbortController,AbortSignal,document,PublicWorkQA:Q,WK:{items:[]},
  localStorage:{getItem:k=>sharedStorage.get(k)||null,setItem:(k,v)=>sharedStorage.set(k,v)},navigator:{clipboard:{writeText:async()=>{}}},
  Option:function(text,value){const o=new Element('option');o.textContent=text;o.value=value;return o;},
  fetch:async(url,options)=>{
   const payload=options.body?JSON.parse(options.body):{action:'status'};requests.push(payload);
   if(payload.action==='status')return response({providers:{openai:{configured:false},gemini:{configured:false}}});
   if(payload.action==='retrieve')return response({sources:[{id:'public-a',ref:'S123456789abc',url:'https://markezine.jp/article/detail/1',title:'広告の検証',source:'MarkeZine',published:'2026-11-01',completeness:'full',text:'公開資料による広告の検証。'}],issues:[]});
   if(payload.action==='models')return state.badModels?{ok:false,status:401,json:async()=>({error:'model_key_invalid'})}:response({models:[{id:'gpt-test-mini',name:'Test text model'}]});
   if(payload.action==='answer')return response({answer:'公開された手法を検証します[S123456789abc]',sources:[{ref:'S123456789abc',url:'https://markezine.jp/article/detail/1',title:'広告の検証'}],limitations:[],follow_ups:[]});
   throw Error('Unexpected action '+payload.action);
  }};
 context.window=context;vm.createContext(context);vm.runInContext(script,context);
 return{nodes,state,requests,storage:sharedStorage,context,async search(q='ROAS下降'){nodes.get('qaQuestion').value=q;await nodes.get('qaFind').onclick();},input(id,value){const e=nodes.get(id);e.value=value;e.listeners.input?.();}};
}
(async()=>{
 const a=app();await a.search();
 assert.equal(a.nodes.get('qaAsk').disabled,false,'finding evidence must not leave an inert disabled answer button when configuration is missing');
 assert(a.nodes.get('qaAsk').textContent.includes('设置 OpenAI'));
 assert(a.nodes.get('qaAnswerHint').textContent.includes('刷新会清空密钥'));
 await a.nodes.get('qaAsk').onclick();assert.equal(a.nodes.get('qaSettings').open,true);assert.equal(a.state.focus,'qaApiKey');assert(!a.requests.some(r=>r.action==='answer'),'opening settings must not invoke a model');
 a.input('qaApiKey','test-only-api-key');assert(a.nodes.get('qaAnswerHint').textContent.includes('验证并读取模型'));
 await a.nodes.get('qaAsk').onclick();assert.equal(a.state.focus,'qaConnect');assert(!a.requests.some(r=>r.action==='models'),'pasting a key does not silently send it');
 await a.nodes.get('qaConnect').onclick();assert.equal(a.nodes.get('qaAsk').disabled,false);assert.equal(a.nodes.get('qaAsk').textContent,'用所选资料回答');assert.equal(a.state.focus,'qaAsk','successful setup returns to the answer action');assert.equal(a.nodes.get('qaSettings').open,false);
 assert(!a.requests.some(r=>r.action==='answer'),'verification does not start a paid answer');
 assert(!JSON.stringify([...a.storage]).includes('test-only-api-key'),'model key remains outside local storage');
 a.input('qaQuestion','如何检验自然销售？');assert.equal(a.nodes.get('qaAsk').textContent,'重新查找依据');await a.nodes.get('qaAsk').onclick();assert.equal(a.requests.at(-1).action,'retrieve');assert.equal(a.nodes.get('qaAsk').textContent,'用所选资料回答');
 const checkbox=a.nodes.get('qaSources').descendants().find(e=>e.tag==='input');checkbox.checked=false;checkbox.onchange();assert.equal(a.nodes.get('qaAsk').disabled,true);assert(a.nodes.get('qaAnswerHint').textContent.includes('至少勾选'));
 checkbox.checked=true;checkbox.onchange();await a.nodes.get('qaAsk').onclick();const answer=a.requests.find(r=>r.action==='answer');assert(answer);assert.equal(answer.provider,'openai');assert.equal(answer.model,'gpt-test-mini');assert.equal(answer.api_key,'test-only-api-key');assert.deepEqual([...answer.source_ids],['public-a']);
 // A new page keeps the shared sync binding, but must guide re-entry of an intentionally ephemeral API key.
 const refreshed=app(a.storage);await refreshed.search();assert.equal(refreshed.nodes.get('qaAsk').disabled,false);assert(refreshed.nodes.get('qaAnswerHint').textContent.includes('刷新会清空密钥'));
 refreshed.input('qaApiKey','invalid-test-key');refreshed.state.badModels=true;await refreshed.nodes.get('qaConnect').onclick();assert.equal(refreshed.nodes.get('qaAsk').disabled,false);assert.notEqual(refreshed.nodes.get('qaAsk').textContent,'用所选资料回答');assert(refreshed.nodes.get('qaStatus').textContent.includes('未通过验证'));assert(!refreshed.requests.some(r=>r.action==='answer'));
 console.log('QA UI passed: missing configuration is actionable, pasted keys require explicit verification, setup returns to answering, edited questions re-search, empty selection is explained, refresh re-entry is guided, invalid keys cannot generate.');
})().catch(error=>{console.error(error);process.exitCode=1;});
