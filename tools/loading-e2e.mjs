import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=await realpath(process.argv[2]||'dist');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const file=await realpath(path.join(root,new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!mime[path.extname(file)]||req.method!=='GET')throw Error();res.setHeader('Content-Type',mime[path.extname(file)]);res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.E2E_BROWSER_PATH?{executablePath:process.env.E2E_BROWSER_PATH}:{})});
 for(const width of [375,1366]){
  const ctx=await browser.newContext({viewport:{width,height:width===375?812:900},isMobile:width===375,hasTouch:width===375,serviceWorkers:'block'}),page=await ctx.newPage();let fail=false;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''});
   if(u.hostname==='images.example.test')return route.fulfill({contentType:'image/webp',body:await readFile(path.join(root,'brand-leaf-52b3102d7d.webp'))});
   if(u.origin!==origin)return route.abort();
   if(u.pathname==='/store.js'){
    const source=await readFile(path.join(root,'store.js'),'utf8');
    return route.fulfill({contentType:'text/javascript',body:source.replace('if(demo){demoSeed();',fail?'if(demo){throw new Error("Offline test");demoSeed();':'if(demo){await new Promise(r=>setTimeout(r,1800));demoSeed();')});
   }
   return route.continue();
  });
  await ctx.addInitScript(()=>{
   const data={};for(let i=0;i<9;i++){const p={id:'loading-'+i,name:'Test Hoya '+i,genus:'Hoya',image:'https://images.example.test/plant.webp',published:true,updatedAt:'2026-01-01',variants:[{id:'v',type:'كتنج',price:30000,available:2}]};data['publicProducts/'+p.id]=p;}localStorage.setItem('temo-v2-demo-only',JSON.stringify(data));
   window.loadingStart=Infinity;window.loadingCLS=0;window.loadingShifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput&&e.startTime>=window.loadingStart){window.loadingCLS+=e.value;window.loadingShifts.push({value:e.value,nodes:e.sources.map(s=>s.node?.className)});}}).observe({type:'layout-shift',buffered:true});
  });
  await page.goto(origin+'/shop.html?demo=1',{waitUntil:'domcontentloaded'});
  // Exclude the demo-only banner insertion; measure the delayed data replacement.
  await page.locator('#demo-banner').waitFor({state:'visible'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{window.loadingStart=performance.now();resolve();}))));
  assert.equal(await page.locator('#catalog').getAttribute('aria-busy'),'true');
  await page.locator('.product-content h3').first().waitFor();await page.waitForTimeout(200);
  assert.equal(await page.locator('#catalog').getAttribute('aria-busy'),'false');
  const cls=await page.evaluate(()=>window.loadingCLS);assert.ok(cls<.1,'delayed data must not shift the page: '+JSON.stringify(await page.evaluate(()=>({cls:window.loadingCLS,shifts:window.loadingShifts}))));
  assert.equal(await page.locator('.product-visual>img').first().getAttribute('loading'),'eager');
  assert.equal(await page.locator('.product-visual>img').first().getAttribute('fetchpriority'),'high');
  assert.equal(await page.locator('.product-visual>img').nth(3).getAttribute('loading'),'lazy');
  assert.equal(await page.evaluate(()=>innerWidth),width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await page.goto(origin+'/shop.html?demo=1&product=loading-0',{waitUntil:'domcontentloaded'});
  await page.locator('.detail-image.skeleton-block').waitFor();await page.locator('.detail-image>img').waitFor();
  assert.equal(await page.locator('.detail-image>img').getAttribute('loading'),'eager');
  fail=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'إعادة المحاولة',exact:true}).waitFor();
  assert.equal(await page.locator('.catalog-skeleton:visible').count(),0);
  fail=false;await page.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();await page.locator('.detail-image>img').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS delayed loading, eager images, deep link and retry '+width);await ctx.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
