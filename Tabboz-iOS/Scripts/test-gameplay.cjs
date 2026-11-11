// Exercise the bundled game's real DOM, event handlers and C/WebAssembly engine.
// Advanced systems use isolated saved-game fixtures; fresh-game checks use defaults.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../Tabboz/Web');
const output = process.env.TABBOZ_TEST_OUTPUT || '/tmp/tabboz-gameplay';
fs.mkdirSync(output, { recursive: true });
for(const name of ['failure.png','failure-state.json']) { const file=path.join(output,name); if(fs.existsSync(file))fs.unlinkSync(file); }
const prefix = 'HKEY_CURRENT_USER\\Software\\Obscured Truckware\\Tabboz Simulator 32';
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.wasm':'application/wasm', '.json':'application/json', '.woff2':'font/woff2', '.woff':'font/woff', '.png':'image/png', '.gif':'image/gif', '.wav':'audio/wav' };
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, relative === '/' ? 'index.html' : '.' + relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const report = { startedAt: new Date().toISOString(), tests: [], dialogs: [], messages: [], errors: [], requestsFailed: [] };
const coverage = new Set();
let browser, context, page, baseSave, origin;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function state() {
  return page.evaluate(() => {
    const win = document.getElementById('win' + window._activeWindowHwnd);
    return win ? { handle: window._activeWindowHwnd, dialog: win.dataset.dialog ? Number(win.dataset.dialog) : 'message', title: win.querySelector('.title-bar-text')?.innerText.trim(), text: win.innerText.trim() } : null;
  });
}
async function idle() {
  await page.waitForFunction(() => typeof window._resolve === 'function', null, { timeout: 10000 });
  await page.waitForTimeout(25);
  const current = await state();
  if (current) coverage.add(current.dialog);
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  return current;
}
async function click(id) {
  const current = await state();
  assert(current, 'No active game window');
  const control = page.locator(`#win${current.handle} button.control${id}, #win${current.handle} input.control${id}, #win${current.handle} img.control${id}`).first();
  assert(await control.count(), `Missing control ${id} in ${JSON.stringify(current)}`);
  const type = await control.getAttribute('type');
  if (type === 'radio' || type === 'checkbox') {
    const domID = await control.getAttribute('id');
    await page.locator(`#win${current.handle} label[for="${domID}"]`).tap();
  } else await control.tap();
  return idle();
}
async function drain(target, choice = 7) {
  for (let i = 0; i < 100; i++) {
    const current = await idle();
    if (current?.dialog === target) return current;
    assert(current, `Game closed while waiting for dialog ${target}`);
    report.messages.push({ dialog: current.dialog, title: current.title, text: current.text.slice(0, 800) });
    const win = page.locator(`#win${current.handle}`);
    let button = win.locator(`button.control${choice}:visible`).first();
    if (!await button.count()) button = win.locator('button.control1:visible').first();
    if (!await button.count()) button = win.locator('button.control2:visible').first();
    assert(await button.count(), `Cannot dismiss event: ${JSON.stringify(current)}`);
    await button.tap();
  }
  throw new Error(`More than 100 nested events before dialog ${target}`);
}
async function open(command, expected) {
  assert.equal((await idle()).dialog, 1, 'Open an activity from main');
  const button = page.locator(`#win${(await state()).handle} button.control${command}`);
  if (await button.count()) await click(command);
  else {
    const menu = page.locator(`.menu${command}`);
    await menu.locator('xpath=../..').tap();
    await menu.tap();
  }
  await drain(expected);
}
async function close(target = 1) { await click(1); return drain(target); }
async function registry() {
  assert.equal((await idle()).dialog, 1, 'Save from the main window');
  await page.evaluate(() => TabbozMobile.save());
  await idle();
  return page.evaluate(prefix => Object.fromEntries(Object.keys(localStorage).filter(k => k === prefix || k.startsWith(prefix + '\\')).map(k => [k, localStorage.getItem(k)])), prefix);
}
function value(save, key) { return JSON.parse(save[prefix + '\\' + key])['']; }
function number(save, key) { return Number(value(save, key)); }
async function fixture(overrides = {}, options = {}) {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 393, height: 759 }, isMobile: true, hasTouch: true });
  const save = options.fresh ? null : structuredClone(baseSave);
  if (save) for (const [key, val] of Object.entries(overrides)) save[prefix + '\\' + key] = JSON.stringify({ '': String(val) });
  await context.addInitScript(({ save, seed }) => {
    Date.now = () => seed;
    let randomState = seed >>> 0;
    Math.random = () => {
      randomState = (randomState + 0x6D2B79F5) >>> 0;
      let value = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    if (save && !sessionStorage.getItem('fixture-loaded')) {
      Object.entries(save).forEach(([key, val]) => localStorage.setItem(key, val));
      sessionStorage.setItem('fixture-loaded', 'yes');
    }
  }, { save, seed: options.seed || 1794168000000 });
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.requestsFailed.push(response.url()); });
  await page.goto(origin);
  await idle();
  if ((await state()).dialog === 12) await click(202);
  await drain(1);
  if (process.env.TABBOZ_TRACE) await page.evaluate(() => {
    window.qaTrace=[];
    for(const name of ['messageBox','destroyWindow','setActiveWindow','dialogBox','_AllocateControl','_PostMessage']) {
      const original=window[name];window[name]=function(...args){
        const entry={name,args:args.slice(0,5)};window.qaTrace.push(entry);
        const result=original(...args);if(name==='_AllocateControl')entry.result=result;return result;
      };
    }
  });
}
async function test(name, fn) {
  if (process.env.TABBOZ_TEST_MATCH && !new RegExp(process.env.TABBOZ_TEST_MATCH).test(name)) return;
  const began = Date.now();
  try { await fn(); report.tests.push({ name, result: 'passed', milliseconds: Date.now() - began }); console.log('PASS:', name); }
  catch (error) {
    report.tests.push({ name, result: 'failed', error: error.stack });
    await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    if (page) {
      fs.writeFileSync(path.join(output, 'failure-state.json'), JSON.stringify(await state(), null, 2));
      fs.writeFileSync(path.join(output, 'failure-dom.html'),await page.content());
      if(process.env.TABBOZ_TRACE) fs.writeFileSync(path.join(output,'failure-trace.json'),JSON.stringify(await page.evaluate(()=>window.qaTrace),null,2));
    }
    console.error('FAIL:',name,error.message);process.exitCode=1;
  }
}
const rich = { Soldi: 20000, Paghetta: 0, Fortuna: 20, Reputazione: 60, Fama: 60, Stato: 100, SoundActive: 0, Materie: 'EEEEEEEEE', Giorno: 1, Mese: 10, GiornoSet: 2, CompMese: 3, CompGiorno: 15 };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined, headless: true });
  await fixture({}, {fresh:true});baseSave=await registry();
  await test('Fresh game: unaffordable purchase leaves money and clothing unchanged', async () => {
    await fixture({}, { fresh: true });
    baseSave = await registry();
    assert.equal(number(baseSave, 'Soldi'), 10);
    await open(143, 80); await click(101); await click(1); await drain(1);
    const saved = await registry();
    assert.equal(number(saved, 'Soldi'), 10); assert.equal(number(saved, 'Giubbotto'), 0);
  });
  await test('Fresh game: buying a packet costs 6,000 lire, adds cigarettes and advances a day', async () => {
    await fixture({}, { fresh: true });
    await open(141, 88); await click(400); await click(1); await drain(1);
    const saved = await registry();
    assert.equal(number(saved, 'Soldi'), 4); assert.equal(number(saved, 'Sigarette'), 19);
    assert.equal(number(saved, 'Giorno'), 1); assert.equal(number(saved, 'Mese'), 10);
  });
  await test('School: selecting a subject and studying changes the correct grade and advances time', async () => {
    await fixture({}, { fresh: true });
    await open(136, 10); await click(111); await click(103); await drain(10); await close();
    const saved = await registry();
    assert.equal(value(saved, 'Materie')[1], 'B'); assert.equal(value(saved, 'Materie')[0], 'A');
    assert.equal(number(saved, 'Studio'), 1); assert.equal(number(saved, 'Mese'), 10);
  });
  await test('All five clothing shops: real selections deduct money and equip jacket, trousers and shoes', async () => {
    await fixture(rich);
    for (const [command, dialog, item, cost, key, equipped] of [[143,80,101,348,'Giubbotto',1],[147,84,104,248,'Giubbotto',4],[144,81,107,90,'Pantaloni',1],[145,82,111,122,'Scarpe',1],[146,83,114,142,'Scarpe',4]]) {
      const before = await registry(); await open(command, dialog); await click(item); await click(1); await drain(1);
      const after = await registry(); assert.equal(number(after, key), equipped); assert(number(after, 'Soldi') <= number(before, 'Soldi') - cost, JSON.stringify({command,cost,before:number(before,'Soldi'),after:number(after,'Soldi'),day:value(after,'Giorno'),weekday:value(after,'GiornoSet')}));
    }
  });

  await test('All clothing shops: cancel does not charge or equip, including female jacket variants', async () => {
    await fixture({...rich, Sesso:'F'});
    for (const [command, dialog, item] of [[143,85,101],[147,86,104],[144,81,108],[145,82,112],[146,83,117]]) {
      const before=await registry(); await open(command,dialog);await click(item);await click(2);await drain(1);
      const after=await registry();assert.equal(number(after,'Soldi'),number(before,'Soldi'));assert.equal(number(after,'Giubbotto'),number(before,'Giubbotto'));
    }
  });
  await test('Gym: missing subscription and insufficient funds are rejected; purchase and duplicate guards work', async () => {
    await fixture({}, {fresh:true});await open(142,89);await click(110);await drain(89);await click(115);await drain(89);await close();
    assert.equal(number(await registry(),'ScadPalGiorno'),0);
    await fixture(rich);await open(142,89);await click(115);await drain(89);await close();
    const bought=await registry();assert.equal(number(bought,'Soldi'),19950);assert.equal(number(bought,'ScadPalGiorno'),1);assert.equal(number(bought,'ScadPalMese'),11);
    await open(142,89);await click(115);await drain(89);await click(110);await drain(89);await close();
    const after=await registry();assert.equal(number(after,'Soldi'),19950);assert(number(after,'Fama')>=60);
  });
  await test('Tanning: a paid session changes the character head and deducts the quoted cost', async () => {
    await fixture(rich);await open(142,89);await click(111);await drain(89);await close();
    const after=await registry();assert.equal(number(after,'Testa'),1);assert.equal(number(after,'Soldi'),19986);
  });
  await test('Disco: entry fee is charged and an actual day passes', async () => {
    await fixture(rich);await open(132,4);await click(102);await click(1);await drain(1);
    const after=await registry();assert.equal(number(after,'Soldi'),19974);assert.equal(number(after,'Giorno'),2);assert(number(after,'Fama')>=60);
  });
  await test('Disco: closing day, dress code and out-of-town transport restrictions reject entry', async () => {
    for(const patch of [{GiornoSet:1},{Fama:0},{outOfTown:true}]) {
      const {outOfTown,...overrides}=patch;await fixture({...rich,...overrides});
      await open(132,4);await click(outOfTown?108:101);await click(1);await drain(1);
      assert.equal(number(await registry(),'Soldi'),20000);
    }
  });
  await test('Scooter: purchase from dealer equips an actual model, charges its price and persists', async () => {
    await fixture(rich);await open(130,7);await click(101);await drain(70);await click(101);await drain(78);await click(121);await click(1);await drain(70);await close(7);await close();
    const after=await registry();assert.equal(value(after,'Scooter\\Nome'),'Magutty Firecow');assert.equal(number(after,'Scooter\\Prezzo'),2498);assert.equal(number(after,'Soldi'),17502);assert(number(after,'Scooter\\Benzina')>0);
  });
  const scooter = {'Scooter\\Speed':65,'Scooter\\Marmitta':0,'Scooter\\Carburatore':0,'Scooter\\CC':0,'Scooter\\Filtro':0,'Scooter\\Prezzo':2498,'Scooter\\Attivita':1,'Scooter\\Stato':100,'Scooter\\Benzina':20,'Scooter\\Nome':'Magutty Firecow'};
  await test('Scooter: park/use toggles and refuelling change real vehicle state and money', async () => {
    await fixture({...rich,...scooter});await open(130,7);await click(105);await close();assert.equal(number(await registry(),'Scooter\\Attivita'),4);
    await open(130,7);await click(105);await click(106);await drain(7);await close();const after=await registry();assert.equal(number(after,'Scooter\\Attivita'),1);assert.equal(number(after,'Scooter\\Benzina'),50);assert.equal(number(after,'Soldi'),19990);
  });
  await test('Scooter: all four tuning categories install parts and charge their original prices', async () => {
    await fixture({...rich,...scooter});await open(130,7);await click(102);await drain(73);
    for(const [category,dialog,part] of [[121,74,133],[123,76,137],[122,75,130],[124,77,141]]) {
      await click(category);await drain(dialog);await click(part);await drain(73);
    }
    await close(7);await close();const after=await registry();for(const key of ['Carburatore','CC','Marmitta','Filtro']) assert.equal(number(after,'Scooter\\'+key),1,key);assert.equal(number(after,'Soldi'),19050);
  });
  await test('Scooter: damaged vehicle repair restores condition and cancelling a sale preserves ownership', async () => {
    await fixture({...rich,...scooter,'Scooter\\Stato':45});await open(130,7);await click(103);await drain(72);await click(1);await drain(7);await click(101);await drain(70);await click(103);await drain(71);await click(2);await drain(70);await close(7);await close();
    const after=await registry();assert(number(after,'Scooter\\Stato')>=90);assert.equal(value(after,'Scooter\\Nome'),'Magutty Firecow');assert(number(after,'Soldi')<20000);
  });
  await test('Scooter: accepting a race consumes fuel and returns to a usable game', async () => {
    await fixture({...rich,...scooter});await open(134,6);await click(101);await drain(6,6);await close();const after=await registry();assert(number(after,'Scooter\\Benzina')<20);assert(number(after,'Reputazione')>=0&&number(after,'Reputazione')<=100);
  });
  await test('Phone: purchase, SIM subscription, matching top-up and sale affect inventory and cash', async () => {
    await fixture(rich);await open(155,120);await click(110);await drain(121);await click(110);await close(120);
    await click(112);await drain(123);await click(110);await close(120);
    await click(112);await drain(123);await click(113);await close(120);await close();
    const after=await registry();assert.equal(value(after,'Cellular\\Nome'),'Motorolo d170');assert.equal(value(after,'Cellular\\NomeAbb'),'Onmitel');assert.equal(number(after,'Cellular\\CreditoRest'),100);assert.equal(number(after,'Soldi'),19550);
    await open(155,120);await click(111);await drain(120,6);await close();assert.equal(number(await registry(),'Cellular\\Stato'),-1);
  });
  await test('Relationships: no-partner guards, searching, telephone, date and confirmed breakup', async () => {
    await fixture({...rich,...scooter,Fama:100,Reputazione:100});await open(133,9);await click(112);await drain(9);await click(113);await drain(9);await page.evaluate(()=>Math.random=()=>0.4);await click(110);await drain(91);await click(101);await drain(9);await close();
    const found=await registry();assert(number(found,'Rapporti')>0,'Search should succeed with this fixture/seed');assert(value(found,'Nometipa').length>0);
    await open(133,9);await click(112);await drain(9);await click(113);await drain(9);await close();const dated=await registry();assert.equal(number(dated,'Soldi'),number(found,'Soldi')-20);assert(number(dated,'Rapporti')>number(found,'Rapporti'));
    await open(133,9);await click(111);await drain(9,6);await close();assert.equal(number(await registry(),'Rapporti'),0);
  });
  await test('Female character: shops, relationship search and calling use the female game branch', async () => {
    await fixture({...rich,Sesso:'F',Fama:100,Reputazione:100});await open(143,85);await click(101);await close();await open(133,190);await page.evaluate(()=>Math.random=()=>0.4);await click(110);await drain(191);await click(101);await drain(190);await close();
    assert.equal(value(await registry(),'Sesso'),'F');assert(number(await registry(),'Rapporti')>0);
  });
  await test('Work: incomplete interview answers are rejected; all nine real quiz layouts accept valid checkbox groups', async () => {
    const seen=new Set();let hired=0;
    for(let attempt=0;attempt<120 && (seen.size<9||!hired);attempt++) {
      await fixture({...rich,Reputazione:100},{seed:1794168000000+attempt*1000});await open(137,13);await click(110);let offer=await idle();assert(offer.dialog>=390&&offer.dialog<=397);await click(1);const quiz=await idle();assert(quiz.dialog>=200&&quiz.dialog<=208);seen.add(quiz.dialog);
      const mark=report.messages.length;
      if(attempt!==0) for(const answer of [101,104,107]) await click(answer);
      await click(1);await drain(13);await close();const after=await registry();if(number(after,'NumeroDitta')>0) hired++;
      const rejected=report.messages.slice(mark).some(m=>m.title.includes('stupid'));
      assert.equal(rejected,attempt===0,'Checkboxes must reach the game exactly once');
    }
    assert.equal(seen.size,9,'Every reachable interview layout');assert(hired>0);report.jobQuizLayouts=[...seen].sort();report.successfulInterviews=hired;
  });
  await test('Work: employed player works, receives monthly salary and can resign', async () => {
    await fixture({...rich,NumeroDitta:1,Impegno:95,GiorniDiLavoro:30,Stipendio:1000,Giorno:26});await open(137,13);await click(116);await drain(13);await close();const paid=await registry();assert.equal(number(paid,'Giorno'),27);assert.equal(number(paid,'Soldi'),21000);assert(number(paid,'NumeroDitta')>0);
    await open(137,13);await click(111);await drain(13,6);await close();const after=await registry();assert.equal(number(after,'NumeroDitta'),0);assert.equal(number(after,'Stipendio'),0);
  });

  await test('School: a paid bribe raises the selected grade, while refusing it keeps the grade and money', async () => {
    await fixture(rich);await open(136,10);await click(111);await click(101);await drain(10,6);await close();const paid=await registry();assert.equal(value(paid,'Materie')[1],'H');assert(number(paid,'Soldi')<20000);
    await fixture(rich);await open(136,10);await click(111);await click(101);await drain(10,7);await close();const refused=await registry();assert.equal(value(refused,'Materie')[1],'E');assert.equal(number(refused,'Soldi'),20000);
  });
  await test('Family: Saturday allowance pays half/full/double according to actual school grades', async () => {
    for(const [grades,amount] of [['AAAAAAAAA',15],['FFFFFFFFF',30],['JJJJJJJJJ',60]]) {
      await fixture({...rich,Paghetta:30,Materie:grades,Giorno:4,GiornoSet:5});await open(135,5);await click(103);await drain(5);await close();assert.equal(number(await registry(),'Soldi'),20000+amount);
    }
  });
  await test('Friends: a fresh character can raise reputation by going out; social guards return safely', async () => {
    await fixture({}, {fresh:true});await open(134,6);await click(101);await drain(6);await click(103);await drain(6);await click(102);await drain(1);const after=await registry();assert(number(after,'Reputazione')>=0);assert.equal(number(after,'Mese'),10);assert(number(after,'Giorno')>=1);
  });
  await test('Phone: wrong-provider top-up and trying to recharge without a SIM do not charge', async () => {
    await fixture(rich);await open(155,120);await click(112);await drain(123);await click(113);await click(1);await drain(123);await click(2);await drain(120);await close();assert.equal(number(await registry(),'Soldi'),20000);
    await fixture({...rich,'Cellular\\NomeAbb':'DIM','Cellular\\CreditoRest':10});await open(155,120);await click(112);await drain(123);await click(113);await click(1);await drain(123);await click(2);await drain(120);await close();const after=await registry();assert.equal(number(after,'Soldi'),20000);assert.equal(number(after,'Cellular\\CreditoRest'),10);
  });
  await test('Relationships: a phone call spends mobile credit before cash; parked scooter blocks a date', async () => {
    await fixture({...rich,...scooter,Rapporti:40,FigTipa:50,Nometipa:'Partner QA','Cellular\\Nome':'Motorolo d170','Cellular\\Stato':100,'Cellular\\CreditoRest':20,'Cellular\\NomeAbb':'Onmitel'});await open(133,9);await click(112);await drain(9);await close();const called=await registry();assert.equal(number(called,'Cellular\\CreditoRest'),18);assert.equal(number(called,'Soldi'),20000);assert.equal(number(called,'Rapporti'),41);
    await fixture({...rich,...scooter,Rapporti:40,FigTipa:50,Nometipa:'Partner QA','Scooter\\Attivita':4});await open(133,9);await click(113);await drain(9);await close();assert.equal(number(await registry(),'Soldi'),20000);
  });
  await test('Relationships: a rejection records the original counter and keeps the game usable', async () => {
    await fixture({...rich,Fama:0,Reputazione:0});await open(133,9);await click(110);await drain(91);await click(101);await drain(9);await close();const after=await registry();assert.equal(number(after,'DdP'),1);assert.equal(number(after,'Rapporti'),0);
  });
  await test('Companies: all eight information dialogs open and return to the real job screen', async () => {
    await fixture(rich);await open(137,13);await click(114);await drain(210);
    for(let company=100;company<=107;company++){await click(company);await drain(company+190);await close(210);}
    await close(13);await close();
  });
  await test('Configuration: currency toggle updates amounts and reset restores a playable female character', async () => {
    await fixture(rich);await open(140,14);await click(107);await close();assert.equal(number(await registry(),'Euro'),1);
    const amount=await page.locator(`#win${(await state()).handle} .control105`).innerText();assert.equal(amount,'10000e');
    await open(140,14);await click(203);await drain(15);await click(101);await click(1);await drain(14);await close();const reset=await registry();assert.equal(value(reset,'Sesso'),'F');assert.equal(number(reset,'Soldi'),10);assert.equal(number(reset,'Giubbotto'),0);await open(133,190);await close();
  });
  await test('Calendar: month rollover, leap day, year rollover, report cards and gym expiry', async () => {
    for(const [patch,expected] of [[{Giorno:31,Mese:10,GiornoSet:2},[1,11]],[{Giorno:28,Mese:2,AnnoBisestile:1,GiornoSet:2},[29,2]],[{Giorno:28,Mese:2,AnnoBisestile:0,GiornoSet:2},[1,3]],[{Giorno:31,Mese:12,GiornoSet:2},[1,1]],[{Giorno:21,Mese:6,GiornoSet:2},[22,6]]]) {
      await fixture({...rich,...patch});await open(135,5);await click(103);await drain(5);await close();const after=await registry();assert.deepEqual([number(after,'Giorno'),number(after,'Mese')],expected);
    }
    await fixture({...rich,Giorno:1,Mese:10,ScadPalGiorno:2,ScadPalMese:10});await open(135,5);await click(103);await drain(5);await close();assert.equal(number(await registry(),'ScadPalGiorno'),0);
  });
  await test('Audio: all supplied clips decode, and missing optional Windows clips do not reject playback', async () => {
    await fixture(rich);
    const decoded=await page.evaluate(async()=>{
      const files=await (await fetch('audio-files.json')).json();const ctx=new AudioContext();
      for(const file of files) await ctx.decodeAudioData(await (await fetch('resources/wavs/'+file)).arrayBuffer());
      for(const file of ['tabs0401.wav','tabs0601.wav','tabs1400.wav']) await new Audio('resources/wavs/'+file).play();
      await ctx.close();return files.length;
    });assert.equal(decoded,28);report.audioClipsDecoded=decoded;
  });
  await test('Extended play: 400 consecutive days with random events and calendar boundaries, then save/reload', async () => {
    await fixture({...rich,Giorno:30,Mese:9,GiornoSet:1,Paghetta:30});await open(135,5);let prior='9/30';const months=new Set();let checkpoints=0;
    for(let day=1;day<=400;day++) {
      await click(103);await drain(5);
      const snapshot=await page.evaluate(prefix=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix+'\\')).map(k=>[k,localStorage.getItem(k)])),prefix);
      const month=number(snapshot,'Mese'),date=number(snapshot,'Giorno'),weekday=number(snapshot,'GiornoSet');
      assert(month>=1&&month<=12&&date>=1&&date<=31&&weekday>=1&&weekday<=7);assert.notEqual(`${month}/${date}`,prior,'Each action must advance a day');prior=`${month}/${date}`;months.add(month);
      for(const key of ['Fama','Reputazione','Studio','Rapporti']) assert(number(snapshot,key)>=0&&number(snapshot,key)<=100,`${key} out of bounds after day ${day}`);
      if(day%50===0){checkpoints++;console.log('  Calendar checkpoint:',day,'days,',prior);}
    }
    await close();const before=await registry();await page.reload();await idle();if((await state()).dialog===12) await click(202);await drain(1);const after=await registry();
    for(const key of ['Soldi','Mese','Giorno','Nome','Cognome','Giubbotto','Scooter\\Nome']) assert.equal(value(after,key),value(before,key),`Restored ${key}`);
    assert.equal(months.size,12);report.simulatedDays=400;report.calendarCheckpoints=checkpoints;
  });


  await test('Scooter: alternative brands can be bought and a confirmed sale removes ownership and pays cash', async () => {
    await fixture(rich);await open(130,7);await click(101);await drain(70);await click(102);await drain(79);await click(122);await click(1);await drain(70);await close(7);await close();const bought=await registry();assert.equal(value(bought,'Scooter\\Nome'),'Honda F98');assert.equal(number(bought,'Soldi'),15652);
    await fixture({...rich,...scooter});await open(130,7);await click(101);await drain(70);await click(103);await drain(71);await click(1);await drain(70);await close(7);await close();const sold=await registry();assert.equal(number(sold,'Scooter\\Stato'),-1);assert(number(sold,'Soldi')>20000);
  });
  await test('Relationships: existing male/female partners can be kept or replaced through the extra-choice dialogs', async () => {
    for(const sex of ['M','F']) {
      await fixture({...rich,Sesso:sex,Fama:100,Reputazione:100,Rapporti:40,FigTipa:40,Nometipa:'Old Partner QA'});const rootDialog=sex==='M'?9:190;
      await open(133,rootDialog);await page.evaluate(()=>Math.random=()=>0.4);await click(110);await drain(sex==='M'?91:191);await click(101);
      // First dismiss the success notice, then reach the original partner-choice dialog.
      await drain(sex==='M'?92:192);await click(102);await drain(rootDialog);await close();
      assert.notEqual(value(await registry(),'Nometipa'),'Old Partner QA');
    }
  });
  await test('Window controls: minimize/restore, activity close, cancelled quit and desktop relaunch preserve the game', async () => {
    await fixture(rich);const before=await registry();
    await page.getByRole('button',{name:'Minimize',exact:true}).tap();await page.waitForTimeout(100);
    assert.equal(await page.locator('#screen > .window:visible').count(),0,'Minimize must hide the game');
    await page.locator('.desktop-item').tap();await drain(1);
    await open(136,10);await page.locator(`#win${(await state()).handle} .title-bar-controls button[aria-label="Close"]`).tap();await drain(1);
    await click(61536);await drain(16);await click(2);await drain(1);
    await click(61536);await drain(16);await page.locator(`#win${(await state()).handle} button.control1`).tap();
    await page.waitForFunction(()=>!document.querySelector('#screen > .window'));
    await page.locator('.desktop-item').tap();await idle();if((await state()).dialog===12) await click(202);await drain(1);
    const after=await registry();assert.equal(value(after,'Soldi'),value(before,'Soldi'));assert.equal(value(after,'Nome'),value(before,'Nome'));
  });


  await test('Mixed progression: 100 rounds with a job, scooter, phone and partner, real actions and random events', async () => {
    await fixture({...rich,...scooter,NumeroDitta:1,Impegno:95,GiorniDiLavoro:20,Stipendio:1000,Rapporti:60,FigTipa:50,Nometipa:'Partner QA','Cellular\\Nome':'Motorolo d170','Cellular\\Stato':100,'Cellular\\Prezzo':290,'Cellular\\CreditoRest':20,'Cellular\\NomeAbb':'Onmitel'});
    const initialHandles=await page.evaluate(()=>_GetLiveHandleCount());let peakHandles=initialHandles;
    const holidays=new Set(['1/1','1/6','4/25','5/1','8/15','11/1','12/7','12/8','12/25','12/26']);
    for(let round=0;round<100;round++) {
      const before=await registry();const month=number(before,'Mese'),day=number(before,'Giorno'),weekday=number(before,'GiornoSet');const date=`${month}/${day}`;
      const schoolDay=weekday!==7&&!holidays.has(date)&&!(month===12&&day>=16)&&!(month===1&&day<=6)&&month!==7&&month!==8;
      switch(round%6) {
        case 0: await open(134,6);await click(102);await drain(1);break;
        case 1: await open(137,13);await click(116);await drain(13);await close();break;
        case 2: await open(130,7);await click(106);await drain(7);await close();break;
        case 3: await open(133,9);await click(round%2?112:113);await drain(9);await close();break;
        case 4: if(schoolDay){await open(136,10);await click(110+(round%9));await click(103);await drain(10);await close();}break;
        case 5: await open(132,4);await click(102);await click(1);await drain(1);break;
      }
      let after=await registry();
      if(`${number(after,'Mese')}/${number(after,'Giorno')}`===date){await open(135,5);await click(103);await drain(5);await close();after=await registry();}
      assert.notEqual(`${number(after,'Mese')}/${number(after,'Giorno')}`,date);
      for(const key of ['Fama','Reputazione','Studio','Rapporti'])assert(number(after,key)>=0&&number(after,key)<=100,`${key} in mixed round ${round}`);
      assert(number(after,'Soldi')>=0);assert(number(after,'Cellular\\CreditoRest')>=-1);assert(number(after,'Scooter\\Benzina')>=0);
      const liveHandles=await page.evaluate(()=>_GetLiveHandleCount());peakHandles=Math.max(peakHandles,liveHandles);
      assert(liveHandles<=initialHandles+16,`Leaked runtime handles: ${initialHandles} initially, ${liveHandles} at round ${round}`);
      if((round+1)%25===0)console.log('  Mixed progression checkpoint:',round+1,'rounds');
    }
    const before=await registry();await page.reload();await idle();if((await state()).dialog===12)await click(202);await drain(1);const after=await registry();
    for(const key of ['Soldi','Giorno','Mese','NumeroDitta','Rapporti','Scooter\\Stato','Scooter\\Benzina','Cellular\\CreditoRest','Materie']) assert.equal(value(after,key),value(before,key),`Mixed restore ${key}`);
    report.mixedProgressionRounds=100;report.runtimeHandles={initial:initialHandles,peak:peakHandles,final:await page.evaluate(()=>_GetLiveHandleCount())};
  });


  await test('Shop hub: every nested shop opens and cancels back to the hub without charging', async () => {
    await fixture(rich);await open(131,8);
    for(const [command,dialog] of [[101,80],[105,84],[102,81],[103,82],[104,83],[110,88]]){await click(command);await drain(dialog);await click(2);await drain(8);}
    await click(111);await drain(89);await close(8);
    await click(112);await drain(120);await click(110);await drain(121);await click(2);await drain(120);await click(112);await drain(123);await click(2);await drain(120);await close(8);await close();
    assert.equal(number(await registry(),'Soldi'),20000);
  });
  await test('Help: original About, usage notice and startup-logo commands return to gameplay', async () => {
    await fixture(rich);await open(120,2);await click(113);await drain(2);await close();await open(121,12);await click(202);await drain(1);
  });
  await test('Random-event branches: all six fight scenes and both scooter accident scenes remain playable', async () => {
    for(let variant=0;variant<8;variant++) {
      await fixture({...rich,...(variant>=6?scooter:{})});await open(135,5);
      const event=variant<6?5:(variant===6?12:18);
      await page.evaluate(({event,variant})=>{
        const sequence=[(event+0.01)/140];if(variant<6)sequence.push((variant+0.01)/6);
        Math.random=()=>{
          const stack=new Error().stack||'';
          if(stack.includes('_emscripten_random'))return sequence.shift()??0.5;
          return 0.5;
        };
      },{event,variant});
      await click(103);assert.equal((await state()).dialog,'message');await click(1);await drain(100+variant);await click(1);await drain(5);await close();const after=await registry();
      if(variant<6)assert.equal(number(after,'Reputazione'),55);
      else assert.equal(number(after,'Scooter\\Stato'),variant===6?65:80);
    }
  });

  assert.deepEqual(report.requestsFailed, [], 'All game assets must load');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  report.dialogs = [...coverage].sort((a,b) => String(a).localeCompare(String(b)));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); await new Promise(resolve => server.close(resolve));
});
