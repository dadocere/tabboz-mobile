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
 const page=await browser.newPage({viewport:{width:393,height:759},isMobile:true,hasTouch:true});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/strings.json',async route=>{await new Promise(r=>setTimeout(r,400));await route.continue()});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'Avvia Tabboz Simulator'}).waitFor();
 await page.waitForTimeout(200);
 async function assertFits(label) {
  const rects=await page.locator('#screen > .window:visible').evaluateAll(els=>els.map(el=>({rect:el.getBoundingClientRect().toJSON(),vw:document.documentElement.clientWidth,vh:document.documentElement.clientHeight})));
  for(const {rect,vw,vh} of rects) {assert(rect.left>=-1 && rect.right<=vw+1 && rect.top>=-1 && rect.bottom<=vh+1, `${label}: ${JSON.stringify({rect,vw,vh})}`)}
 }
 await assertFits('splash');await page.getByRole('button',{name:'Avvia Tabboz Simulator'}).tap();
 await page.getByRole('button',{name:'Scooter',exact:true}).waitFor();
 await assertFits('main');
 for (const name of ['Scooter','Disco','Scuola','Lavoro','Compagnia','Famiglia']) {
  await page.getByRole('button',{name,exact:true}).tap();
  const ok=page.getByRole('button',{name:'OK',exact:true});await ok.waitFor();await page.waitForTimeout(70);await assertFits(name);await ok.tap();
 }
 await page.setViewportSize({width:759,height:393});await page.waitForTimeout(150);await assertFits('landscape');
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(150);await assertFits('small phone');
 await page.locator('.main-menu > li').filter({hasText:'Special'}).tap();await page.locator('.menu139').tap();
 await page.getByRole('textbox',{name:'Nome',exact:true}).fill('BrowserTest');await page.getByRole('button',{name:'OK',exact:true}).tap();
 await page.waitForTimeout(250);await page.reload();await page.getByRole('button',{name:'Avvia Tabboz Simulator'}).waitFor();await page.getByRole('button',{name:'Avvia Tabboz Simulator'}).tap();
 await page.getByText('BrowserTest Caio',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: delayed startup, six real touch dialogs, portrait/landscape/small-phone bounds, profile save and reload; no JS errors');
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
})().catch(e=>{console.error(e);process.exit(1)});
