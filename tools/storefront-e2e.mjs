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
const results=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.E2E_BROWSER_PATH?{executablePath:process.env.E2E_BROWSER_PATH}:{})});
 for(const viewport of [{width:375,height:812},{width:1366,height:900}]){
  for(const scenario of ['layout-navigation','cart-checkout','multiple-variants','share-sold-out']){
   const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block'});
   const blocked=[],errors=[];
   await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(['gc.kis.v2.scr.kaspersky-labs.com','me.kis.v2.scr.kaspersky-labs.com'].includes(url.hostname))return route.abort();
    // Optional web font is stubbed locally: no font service receives a request.
    if(url.origin==='https://fonts.googleapis.com'&&url.pathname==='/css2'&&request.method()==='GET')
      return route.fulfill({status:200,contentType:'text/css',body:'/* offline font fallback */'});
    if(url.origin!==origin||url.pathname.startsWith('/.netlify/')||!['GET','HEAD'].includes(request.method())){
     blocked.push(url.origin+url.pathname);return route.abort();
    }
    return route.continue();
   });
   if(scenario==='multiple-variants')await context.addInitScript(()=>{
    const p={id:'fixture-multi',name:'Test Multi Hoya',genus:'Hoya',published:true,image:'',updatedAt:'2026-01-01',variants:[{id:'a',type:'كورمة',price:10000,available:2},{id:'b',type:'كتنج',price:20000,available:3}]};
    localStorage.setItem('temo-v2-demo-only',JSON.stringify({['publicProducts/'+p.id]:p}));
   });
   if(scenario==='share-sold-out')await context.addInitScript(()=>{
    const p={id:'fixture-empty',name:'Sold out Hoya',genus:'Hoya',published:true,image:'',variants:[{id:'a',type:'كتنج',price:10000,available:0}]};
    localStorage.setItem('temo-v2-demo-only',JSON.stringify({['publicProducts/'+p.id]:p,['publicProducts/private']:{...p,id:'private',name:'Private mother',published:false}}));
   });
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   const name=`${viewport.width}-${scenario}`;
   try{
    await page.goto(origin+'/shop.html?demo=1');
    await page.locator('.product-card').first().waitFor();
    if(scenario==='layout-navigation'){
     const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,art:document.querySelector('.hero-art').getBoundingClientRect().height,header:document.querySelector('.topbar').getBoundingClientRect().height,card:document.querySelector('.product-card').getBoundingClientRect().top+scrollY}));
     assert.equal(layout.scroll,layout.width,'Document must not scroll horizontally');
     if(viewport.width===375){assert.ok(layout.header<=60.5,JSON.stringify(layout));assert.ok(layout.art>=250 && layout.art<=310,JSON.stringify(layout));assert.ok(layout.card-layout.art<=520,JSON.stringify(layout));}
     assert.ok(await page.locator('#catalog').evaluate(e=>e.classList.contains('is-shelves')));
     await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
     await page.locator('#genus-chips button').filter({hasText:'Alocasia'}).click();
     assert.match(page.url(),/genus=/);
     assert.equal(await page.locator('#catalog').evaluate(e=>e.classList.contains('is-shelves')),false);
     if(viewport.width===375)assert.equal(await page.locator('#catalog').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),2);
     await page.goBack();
     await page.waitForFunction(()=>document.querySelector('#catalog').classList.contains('is-shelves'));
     await page.locator('#search').fill('Monstera');
     await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===1);
     assert.match(await page.locator('.product-card').innerText(),/Monstera/);
     await page.locator('#search').fill('');
     await page.waitForFunction(()=>document.querySelector('#catalog').classList.contains('is-shelves'));
    }else if(scenario==='cart-checkout'){
     await page.getByRole('button',{name:'أضف للسلة',exact:true}).first().click();
     assert.ok(!new URL(page.url()).searchParams.has('product'));
     await page.getByRole('button',{name:'سلة الطلب (1)',exact:true}).waitFor();
     await page.reload();
     await page.getByRole('button',{name:'سلة الطلب (1)',exact:true}).click();
     await page.locator('#dialog input[type=number]').fill('2');
     await page.locator('#dialog input[type=number]').press('Tab');
     await page.getByRole('button',{name:'متابعة الطلب',exact:true}).click();
     await page.getByLabel('الاسم',{exact:true}).fill('اختبار آلي');
     await page.getByLabel('رقم الجوال',{exact:true}).fill('0500000000');
     await page.getByLabel('المدينة',{exact:true}).fill('مدينة تجريبية');
     await page.getByLabel('أوافق على استخدام بياناتي لمعالجة هذا الطلب').check();
     await page.getByRole('button',{name:'إرسال الطلب — الدفع بعد التأكيد',exact:true}).click();
     await page.locator('.order-number').waitFor();
     assert.match(await page.locator('.order-number').innerText(),/^DEMO-/);
     const orders=await page.evaluate(()=>Object.entries(JSON.parse(localStorage.getItem('temo-v2-demo-only'))).filter(([k])=>k.startsWith('webRequests/')).map(([,v])=>v));
     assert.equal(orders.length,1);assert.equal(orders[0].items[0].qty,2);assert.equal(orders[0].status,'pending');
     await page.getByRole('button',{name:'سلة الطلب (0)',exact:true}).waitFor();
     await page.getByRole('link',{name:'متابعة حالة الطلب',exact:true}).click();
     await page.getByText('بانتظار مراجعة المتجر',{exact:true}).waitFor();
    }else if(scenario==='share-sold-out'){
     assert.equal(await page.getByText('Private mother',{exact:true}).count(),0);
     await page.getByRole('button',{name:'غير متوفر — عرض التفاصيل',exact:true}).first().click();
     assert.equal(await page.getByRole('button',{name:'أضف إلى سلة الطلب',exact:true}).isDisabled(),true);
     await page.getByRole('button',{name:'مشاركة النبتة',exact:true}).click();
     const wa=new URL(await page.getByRole('link',{name:'مشاركة عبر واتساب'}).getAttribute('href')); const u=new URL(wa.searchParams.get('text').split('\n').pop());
     assert.equal(u.searchParams.get('product'),'fixture-empty');assert.equal(u.searchParams.get('demo'),'1');
     assert.equal(u.searchParams.has('genus'),false);
     assert.equal(await page.getByRole('button',{name:'نسخ الرابط',exact:true}).isVisible(),true);
     await context.grantPermissions(['clipboard-read','clipboard-write']);
     await page.getByRole('button',{name:'نسخ الرابط',exact:true}).click();
     await page.getByText('تم نسخ الرابط',{exact:true}).waitFor();
     assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),u.href);
     await page.keyboard.press('Escape');
     assert.equal(await page.locator('#product-share-options').isVisible(),false);
     await page.getByRole('button',{name:'مشاركة النبتة',exact:true}).click();
     await page.locator('.detail-name').click();
     assert.equal(await page.locator('#product-share-options').isVisible(),false);
     await page.getByRole('button',{name:'مشاركة النبتة',exact:true}).click();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
    }else{
     await page.getByRole('button',{name:'اختر الصنف',exact:true}).first().click();
     assert.match(page.url(),/product=fixture-multi/);
     await page.locator('#variant').waitFor();
     await page.locator('#variant').selectOption('b');
     await page.getByRole('button',{name:'أضف إلى سلة الطلب',exact:true}).first().click();
     await page.getByRole('button',{name:'سلة الطلب (1)',exact:true}).waitFor();
     await page.reload();await page.locator('#variant').waitFor();
    }
    assert.deepEqual(blocked,[],'Unexpected external/API request');assert.deepEqual(errors,[],'Browser errors');
    results.push({name,passed:true});console.log('PASS',name);
   }catch(error){
    await page.screenshot({path:path.join(out,name+'-failure.png'),fullPage:true}).catch(()=>{});
    results.push({name,passed:false,error:error.stack,blocked,errors});console.error('FAIL',name,error.message);
   }finally{await context.close();}
  }
 }
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 await writeFile(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),root,results},null,2));
}
if(results.length!==8||results.some(r=>!r.passed))process.exitCode=1;
