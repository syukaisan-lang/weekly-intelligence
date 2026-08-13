(() => {
  const AUTO_LOCK_MS=15*60*1000;
  const HIDDEN_LOCK_MS=5*60*1000;
  const PRIVATE_ITERATIONS=600000;
  let passphraseMemory='';
  let lastActivity=Date.now();
  let hiddenAt=0;
  let failures=0;
  const caches=new Map();

  function b64bytes(s){const bin=atob(s);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
  function bytesB64(bytes){let bin='';for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);}
  async function deriveKey(pass,salt,iterations,usages){
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,usages);
  }
  async function maybeGunzip(bytes,compression){
    if(compression!=='gzip')return bytes;
    if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot decompress the encrypted backup.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function maybeGzip(bytes,useCompression){
    if(!useCompression||typeof CompressionStream==='undefined')return {bytes,compression:null};
    const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return {bytes:new Uint8Array(await new Response(stream).arrayBuffer()),compression:'gzip'};
  }
  async function decryptEnvelope(env,pass){
    const key=await deriveKey(pass,b64bytes(env.salt),Number(env.iterations||220000),['decrypt']);
    const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64bytes(env.iv)},key,b64bytes(env.ciphertext));
    const unpacked=await maybeGunzip(new Uint8Array(raw),env.compression);
    return JSON.parse(new TextDecoder().decode(unpacked));
  }
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  function ensureDialog(){
    let d=document.getElementById('privateUnlockDialog');if(d)return d;
    d=document.createElement('dialog');d.id='privateUnlockDialog';d.className='secure-dialog';
    d.innerHTML=`<form method="dialog" class="secure-dialog-card" autocomplete="off">
      <div class="secure-lock-icon">🔐</div>
      <h2>解锁私人知识</h2>
      <p>密码只保留在当前页面内存，不写入 localStorage / sessionStorage。刷新、关闭页面或自动锁定后需要重新输入。</p>
      <label>Dashboard 密码<input id="privateUnlockInput" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>
      <div id="privateUnlockError" class="secure-error" aria-live="polite"></div>
      <div class="secure-dialog-actions"><button value="cancel" class="btn secondary" type="submit">取消</button><button id="privateUnlockSubmit" value="unlock" class="btn" type="submit">解锁</button></div>
    </form>`;
    document.body.appendChild(d);return d;
  }
  async function askPassphrase(){
    if(passphraseMemory)return passphraseMemory;
    const d=ensureDialog(),input=d.querySelector('#privateUnlockInput'),err=d.querySelector('#privateUnlockError');
    input.value='';err.textContent='';
    const value=await new Promise(resolve=>{
      const handler=()=>{d.removeEventListener('close',handler);const v=d.returnValue==='unlock'?input.value:'';input.value='';resolve(v);};
      d.addEventListener('close',handler);d.showModal();setTimeout(()=>input.focus(),30);
    });
    return value;
  }
  function touch(){if(passphraseMemory)lastActivity=Date.now();}
  ['pointerdown','keydown','scroll','touchstart'].forEach(ev=>window.addEventListener(ev,touch,{passive:true}));
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hiddenAt=Date.now();return;}
    if(hiddenAt&&Date.now()-hiddenAt>HIDDEN_LOCK_MS&&passphraseMemory)lockPrivateData(true);
    hiddenAt=0;
  });
  setInterval(()=>{if(passphraseMemory&&Date.now()-lastActivity>AUTO_LOCK_MS)lockPrivateData(true);},30000);

  function lockPrivateData(reload=false){
    passphraseMemory='';caches.clear();lastActivity=Date.now();
    if(reload)location.reload();
  }

  async function decryptPrivateEnvelopeData(env,options={}){
    let pass=passphraseMemory;
    if(!pass&&options.prompt!==false)pass=await askPassphrase();
    if(!pass)throw new Error('Unlock cancelled');
    if(failures)await wait(Math.min(8000,500*(2**Math.min(failures,4))));
    try{
      const data=await decryptEnvelope(env,pass);
      passphraseMemory=pass;lastActivity=Date.now();failures=0;return data;
    }catch(e){
      failures+=1;passphraseMemory='';
      const err=document.getElementById('privateUnlockError');if(err)err.textContent='密码不正确，或加密数据无法读取。';
      throw e;
    }
  }

  async function encryptPrivatePayload(payload,options={}){
    let pass=passphraseMemory;
    if(!pass&&options.prompt!==false)pass=await askPassphrase();
    if(!pass)throw new Error('Unlock cancelled');
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const plain=new TextEncoder().encode(JSON.stringify(payload));
    const packed=await maybeGzip(plain,options.compress!==false&&plain.length>900);
    const key=await deriveKey(pass,salt,PRIVATE_ITERATIONS,['encrypt']);
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,packed.bytes));
    passphraseMemory=pass;lastActivity=Date.now();
    const env={version:2,algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:PRIVATE_ITERATIONS,salt:bytesB64(salt),iv:bytesB64(iv),ciphertext:bytesB64(ciphertext)};
    if(options.kind)env.kind=String(options.kind);
    if(options.createdAt!==false)env.created_at=new Date().toISOString();
    if(packed.compression)env.compression=packed.compression;
    return env;
  }

  async function loadEncryptedData(metaUrl,encUrl,options={}){
    const cacheKey=encUrl;if(caches.has(cacheKey))return caches.get(cacheKey);
    const meta=await fetch(metaUrl,{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'}).then(r=>{if(!r.ok)throw new Error(`metadata HTTP ${r.status}`);return r.json();});
    if(!meta?.meta?.encrypted_full_data){caches.set(cacheKey,meta);return meta;}
    let pass=passphraseMemory;
    if(!pass&&options.prompt!==false)pass=await askPassphrase();
    if(!pass)return {...meta,locked:true};
    if(failures)await wait(Math.min(8000,500*(2**Math.min(failures,4))));
    try{
      const env=await fetch(encUrl,{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'}).then(r=>{if(!r.ok)throw new Error('encrypted data not generated yet');return r.json();});
      const data=await decryptEnvelope(env,pass);
      passphraseMemory=pass;lastActivity=Date.now();failures=0;data.locked=false;caches.set(cacheKey,data);return data;
    }catch(e){
      failures+=1;passphraseMemory='';caches.delete(cacheKey);
      const err=document.getElementById('privateUnlockError');if(err)err.textContent='密码不正确，或加密数据尚未生成。';
      if(options.prompt!==false&&failures<5)alert(`解锁失败。连续失败将增加等待时间。`);
      return {...meta,locked:true,decryption_error:e.message};
    }
  }

  async function loadKnowledgeData(options={}){return loadEncryptedData('data/knowledge.json','data/knowledge.enc.json',options);}
  async function loadWorkSystemData(options={}){return loadEncryptedData('data/work-system.json','data/work-system.enc.json',options);}
  async function loadSystemModelData(options={}){return loadEncryptedData('data/system-model.json','data/system-model.enc.json',options);}
  window.loadEncryptedData=loadEncryptedData;
  window.loadKnowledgeData=loadKnowledgeData;
  window.loadWorkSystemData=loadWorkSystemData;
  window.loadSystemModelData=loadSystemModelData;
  window.encryptPrivatePayload=encryptPrivatePayload;
  window.decryptPrivateEnvelopeData=decryptPrivateEnvelopeData;
  window.forgetKnowledgePassphrase=()=>lockPrivateData(false);
  window.lockPrivateData=lockPrivateData;
  window.hasKnowledgePassphrase=()=>!!passphraseMemory;
})();
