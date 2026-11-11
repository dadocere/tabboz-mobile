// Optional browser regression suite. Point PLAYWRIGHT_MODULE at an installed Playwright package.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname, '../Tabboz/Web');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.gif':'image/gif','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,relative==='/'?'index.html':'.'+relative);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const chrome=process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 const browser=await chromium.launch({executablePath:fs.existsSync(chrome)?chrome:undefined,headless:true});
 try {
  const page=await browser.newPage({viewport:{width:393,height:759},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__adMessages=[];
   window.webkit={messageHandlers:{tabboz:{postMessage:message=>window.__adMessages.push(message)}}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Avvia Tabboz Simulator',exact:true}).click();
  await page.getByRole('button',{name:'Scooter',exact:true}).waitFor();
  async function returnToMain(){
   for(let attempt=0;attempt<100;attempt++){
    if(await page.getByRole('button',{name:'Scooter',exact:true}).count())return;
    const close=page.getByRole('button',{name:/^(OK|Ci rinuncio\.\.\.|Annulla|No)$/i}).last();
    if(await close.count()) {
     try { await close.click({timeout:300}); } catch(error) { /* A modal can close while its parent becomes active. */ }
    }
    await page.waitForTimeout(30);
   }
   throw Error('Game activity did not return to main: '+await page.locator('#screen').innerText());
  }
  for(let i=0;i<6;i++){
   await page.getByRole('button',{name:'Compagnia',exact:true}).click();
   await page.getByRole('button',{name:'Esci con la compagnia',exact:true}).click();
   await returnToMain();
   // Deliberately navigate immediately: counts must survive skipped ad opportunities.
  }
  await page.waitForFunction(()=>window.__adMessages.filter(m=>m.type==='adCompleted').length===6,{},{timeout:5000});
  let counts=await page.evaluate(()=>window.__adMessages.filter(m=>m.type==='adCompleted'));
  assert.equal(new Set(counts.map(m=>m.token)).size,6,'Completions must be unique');
  await page.waitForTimeout(900);
  const token=await page.evaluate(()=>window.__adMessages.filter(m=>m.type==='adOpportunity').at(-1)?.token);
  assert.ok(token,'Stable main screen should offer a safe boundary');
  assert.equal(await page.evaluate(token=>window.TabbozMobile.beginAd(token),token),true,'Latest safe opportunity must prepare');
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(()=>window.__adMessages.filter(m=>m.type==='adHeartbeat').at(-1).active),'false','Ad playback must stop gameplay time');
  await page.evaluate(()=>window.TabbozMobile.endAd());
  await page.mouse.move(30, 40);
  await page.mouse.down();
  assert.equal(await page.evaluate(()=>window.TabbozMobile.beginAd(null)),false,'A held pointer must prevent presentation');
  await page.mouse.up();
  await page.getByRole('button',{name:'Compagnia',exact:true}).click();
  assert.equal(await page.evaluate(token=>window.TabbozMobile.beginAd(token),token),false,'Old opportunity must not interrupt a new activity');
  await page.getByRole('button',{name:'OK',exact:true}).click();
  await page.waitForTimeout(1200);
  counts=await page.evaluate(()=>window.__adMessages.filter(m=>m.type==='adCompleted'));
  assert.equal(counts.length,6,'Opening/cancelling a dialog must not count as gameplay');
  assert.deepEqual(errors,[]);
  console.log('PASS: six rapid real-game outings counted once each; cancelled dialog ignored; safe preparation, paused heartbeat, held-pointer protection and stale-opportunity rejection');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1)});
