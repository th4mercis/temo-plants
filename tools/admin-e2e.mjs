import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Serve local static files only. Never point these checks at a live storefront.
const root=await realpath(process.argv[2] || '.');
const out=path.resolve(process.env.E2E_OUTPUT || 'e2e-results');
await mkdir(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method))throw Error('method');
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=await realpath(path.join(root,pathname==='/'?'shop.html':pathname));
    const relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)||!mime[path.extname(target)])throw Error('path');
    res.setHeader('Content-Type',mime[path.extname(target)]);
    res.end(req.method==='HEAD'?undefined:await readFile(target));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.E2E_BROWSER_PATH?{executablePath:process.env.E2E_BROWSER_PATH}:{})});
 for(const viewport of [{width:375,height:812},{width:812,height:375},{width:1366,height:900}]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block'});
  const errors=[],blocked=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''});
   // Block antivirus-injected traffic without counting it as an application request.
   if(u.hostname==='gc.kis.v2.scr.kaspersky-labs.com')return route.abort();
   if(u.origin!==origin||u.pathname.startsWith('/.netlify/')){blocked.push(u.origin+u.pathname);return route.abort();}
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/temo-plants.html?demo=1');
  await page.getByRole('heading',{name:'يحتاج إجراء',exact:true}).waitFor();
  assert.match(await page.locator('.admin-task').filter({hasText:'أصول تحتاج توثيق سعر الشراء'}).innerText(),/3 سجل/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'dashboard overflow');
  await page.screenshot({path:path.join(out,'admin-dashboard-'+viewport.width+'.png'),fullPage:true});
  await page.evaluate(()=>{
   const k='temo-v2-demo-only',d=JSON.parse(localStorage.getItem(k)),p=d['products/demo-0'];
   p.originPurchase={status:'purchased',form:'شتلة صغيرة',amount:70000,notes:''};
   p.variants.push({id:'mother',type:'مذر',sell:false,qty:1,reserved:0,price:0,cost:0});
   const q=d['products/demo-1'];q.published=false;q.variants[0].price=0;
   localStorage.setItem(k,JSON.stringify(d));
  });
  await page.reload();
  await page.getByRole('button',{name:'نباتاتي',exact:true}).click();
  await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Alocasia Frydek Variegata',exact:true})}).getByRole('button',{name:'فتح ملف النبتة'}).click();
  await page.getByText('تكلفة الأصل:',{exact:false}).waitFor();
  assert.equal(await page.getByText('غير مطروح للبيع',{exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'plant overflow');
  await page.screenshot({path:path.join(out,'admin-plant-'+viewport.width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'المعروض للبيع',exact:true}).click();
  await page.getByRole('combobox',{name:'حالة العرض',exact:true}).selectOption('collection');
  assert.equal(await page.getByRole('article').count(),1);
  assert.equal(await page.getByRole('button',{name:'تسجيل طلب',exact:true}).count(),0);
  await page.getByRole('combobox',{name:'حالة العرض',exact:true}).selectOption('unpriced');
  assert.equal(await page.getByRole('article').count(),1);
  await page.getByRole('button',{name:'تعديل العرض',exact:true}).click();
  await page.getByRole('combobox',{name:'حالة الصنف',exact:true}).selectOption('off');
  await page.getByRole('button',{name:'حفظ وتأكيد',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('temo-v2-demo-only'))['products/demo-1']);
  assert.equal(saved.variants[0].sell,false);assert.equal(saved.variants[0].qty,4);assert.equal(saved.variants[0].cost,10800);assert.equal(saved.published,false);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log('PASS admin workflow '+viewport.width);
  await context.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
