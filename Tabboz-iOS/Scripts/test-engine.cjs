// Runs the actual bundled C/WebAssembly engine with a headless Win32 UI adapter.
// No browser rendering is simulated or verified here. No npm dependencies.
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname, '../Tabboz/Web');
const windows=new Map(), storage=new Map(); let active=null,resolve;
const controls=new Map();
const noop=()=>{};
const ctx={console:{log:noop,warn:console.warn,error:console.error},addEventListener:noop,requestAnimationFrame:noop,require,process,__dirname:root,__filename:root+'/zarrosim.js',Buffer,URL,TextDecoder,TextEncoder,WebAssembly,setTimeout,clearTimeout,setInterval,clearInterval,performance,
Module:{wasmBinary:fs.readFileSync(root+'/zarrosim.wasm'),postRun:()=>setTimeout(()=>{ctx._WinMainStartup()},0)},
localStorage:{get length(){return storage.size},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
document:{addEventListener:noop,querySelector:()=>({classList:{add:noop}})},Audio:function(){this.play=async()=>{}},
loadStringResources:async()=>{},preload:async()=>{},eventListenerSetup:noop,
getSystemMetrics:i=>i===0?640:600,
waitEvent:()=>new Promise(r=>{resolve=r}),stopWaiting:()=>{const r=resolve;resolve=null;r?.()},
setActiveWindow:h=>{active=h;ctx._activeWindowHwnd=h},showApp:noop,showWindow:(h,v)=>true,moveWindow:noop,getWindowRectDimension:()=>400,setIcon:noop,drawImage:async()=>{},addMenuToWindow:async()=>{},shutdown:noop,
setDlgItemText:(h,id,p)=>{controls.set(`${h}:${id}`,ctx.UTF8ToString(p))},getDlgItemText:(h,id,p,n)=>{ctx.stringToUTF8(controls.get(`${h}:${id}`)||'',p,n)},
setCheck:noop,getCheck:()=>1,comboBoxAddString:noop,comboBoxSelect:noop,
loadString:(id,p,n)=>{const s=JSON.parse(fs.readFileSync(root+'/resources/strings/strings.json','utf8'))[id]||'';ctx.stringToUTF8(s,p,n);return s.length},
messageBox:async(h,text,caption)=>{windows.set(h,{dialog:'message'});active=h;},
destroyWindow:h=>{windows.delete(h)},
dialogBox:async(h,dialog,parent,inst)=>{active=h;const html=fs.readFileSync(root+`/resources/dialogs/includes/${dialog}.inc.html`,'utf8');windows.set(h,{dialog});for(const tag of html.match(/<[^>]+class="[^"]*\bdlg_item\b[^>]+>/g)||[]){const id=Number(tag.match(/class="[^"]*?(\d+)/)?.[1]);const cls=tag.match(/data-class="([^"]+)"/)?.[1];if(id!==-1&&cls){const p=ctx._malloc(128);ctx.stringToUTF8(cls,p,128);ctx._AllocateControl(inst,p,h,id);ctx._free(p);}}}
};

ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(root+'/mobile.js','utf8'),ctx,{filename:'mobile.js'});
vm.runInContext(fs.readFileSync(root+'/zarrosim.js','utf8'),ctx,{filename:root+'/zarrosim.js'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate, label) {
  for (let i=0;i<200;i++) { if(predicate()) return; await delay(10); }
  throw new Error(`Timed out: ${label}`);
}
function command(handle, id) { ctx._PostMessage(handle,0x111,id,0);ctx.stopWaiting(); }
function saved(key) {
  const match=[...storage].find(([k])=>k.endsWith('\\'+key));
  return match ? JSON.parse(match[1])[''] : undefined;
}
(async()=>{
  await until(()=>windows.get(active)?.dialog===12,'original startup splash');
  command(active,1);
  await until(()=>windows.get(active)?.dialog===1 && controls.has(`${active}:105`),'main game');
  const main=active;
  assert.equal(controls.get(`${main}:102`),'Tizio Caio');
  assert.equal(controls.get(`${main}:105`),'10000 L.');
  console.log('PASS: original splash, default character, 10,000 lire');

  command(main,139);
  await until(()=>windows.get(active)?.dialog===11,'personal information');
  controls.set(`${active}:102`,'Davide');command(active,102);
  await delay(30);
  command(active,1);
  await until(()=>windows.size===1 && controls.get(`${main}:102`)==='Davide Caio','character edit');
  ctx.TabbozMobile.save();
  await until(()=>saved('Nome')==='Davide','original engine save');
  assert.equal(saved('Soldi'),'10');
  console.log('PASS: profile editing and original registry save format');

  for(const [id,name] of [[130,'Scooter'],[132,'Disco'],[136,'Scuola'],[137,'Lavoro'],[134,'Compagnia'],[135,'Famiglia'],[133,'Tipa'],[143,'Bau House'],[147,'Blue Rider'],[144,'Zoccolaro'],[145,'Footsmocker'],[146,'Footsmocker II'],[141,'Bar Tabacchi'],[142,'Palestra'],[155,'Telefonino'],[140,'Configuration'],[120,'About']]) {
    command(main,id);
    await until(()=>windows.size>1,name);
    command(active,1);
    await until(()=>windows.size===1,`close ${name}`);
  }
  console.log('PASS: all 17 main activities, shops, configuration and About open and close');

  ctx.TabbozMobile.save();
  await delay(50);
  const snapshot=Object.fromEntries(storage);
  const before=JSON.stringify([...storage]);
  assert.throws(()=>ctx.TabbozMobile.restoreSave(JSON.stringify({format:'wrong',version:1,registry:snapshot})));
  assert.throws(()=>ctx.TabbozMobile.restoreSave(JSON.stringify({format:'tabboz-mobile',version:1,registry:{unrelated:'{}'}})));
  assert.throws(()=>ctx.TabbozMobile.restoreSave(JSON.stringify({format:'tabboz-mobile',version:1,registry:{[Object.keys(snapshot)[0]]:'{}'}})));
  assert.equal(JSON.stringify([...storage]),before,'invalid backups must preserve existing progress');
  const valid=JSON.stringify({format:'tabboz-mobile',version:1,registry:snapshot});
  assert.equal(ctx.TabbozMobile.restoreSave(valid),true);
  assert.equal(saved('Nome'),'Davide');
  console.log('PASS: mobile backup round trip and invalid/incomplete backup rejection');

  // Restart the original game to verify that it reloads persisted progress.
  ctx._PostMessage(main,0x111,108,0);ctx.stopWaiting();
  await until(()=>windows.size>1,'close confirmation');command(active,1);
  await until(()=>windows.size===0,'original game exit');
  ctx._WinMainStartup();
  await until(()=>windows.size>0,'relaunch');
  if(windows.get(active)?.dialog===12) { command(active,1); }
  await until(()=>windows.get(active)?.dialog===1 && controls.get(`${active}:102`)==='Davide Caio','restored profile');
  assert.equal(controls.get(`${active}:105`),'10000 L.');
  console.log('PASS: original game relaunch restores character and money');
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
