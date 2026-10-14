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
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'collection overflow');
  assert.equal(await page.locator('.collection-card').count(),3);
  assert.equal(await page.locator('.collection-more[open]').count(),0);
  assert.ok(await page.locator('.collection-card').first().evaluate(e=>e.getBoundingClientRect().height)<300,'compact card height');
  await page.screenshot({path:path.join(out,'admin-collection-'+viewport.width+'.png'),fullPage:true});
  await page.getByRole('searchbox',{name:'بحث النباتات'}).fill('Frydek');
  assert.equal(await page.locator('.collection-card').count(),1);
  await page.getByText('الأصناف والإجراءات',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'إضافة إنتاج',exact:true}).isVisible(),true);
  await page.getByRole('searchbox',{name:'بحث النباتات'}).fill('');

  await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Alocasia Frydek Variegata',exact:true})}).getByRole('button',{name:'فتح ملف النبتة'}).click();
  await page.getByText('تكلفة الأصل:',{exact:false}).waitFor();
  assert.equal(await page.getByText('هذا الصنف غير مخصص للبيع',{exact:true}).count(),1);
  assert.equal(await page.locator('.plant-variants-table tbody tr').count(),2);
  assert.equal(await page.locator('.plant-variants-table tbody tr').filter({hasText:'مذر'}).locator('td').nth(3).innerText(),'—');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'plant overflow');
  await page.screenshot({path:path.join(out,'admin-plant-'+viewport.width+'.png'),fullPage:true});
  assert.equal(await page.getByRole('button',{name:'المعروض للبيع',exact:true}).count(),0);
  await page.getByRole('button',{name:'نباتاتي',exact:true}).click();
  await page.getByRole('combobox',{name:'العرض في المتجر',exact:true}).selectOption('off');
  assert.equal(await page.locator('.collection-card').count(),1);
  await page.getByRole('combobox',{name:'العرض في المتجر',exact:true}).selectOption('live');
  assert.equal(await page.locator('.collection-card').count(),2);
  await page.screenshot({path:path.join(out,'merged-plants-'+viewport.width+'.png'),fullPage:true});
  await page.getByRole('combobox',{name:'العرض في المتجر',exact:true}).selectOption('off');
  await page.getByRole('button',{name:'فتح ملف النبتة',exact:true}).click();
  await page.getByRole('button',{name:'إدارة العرض',exact:true}).click();
  await page.getByRole('combobox',{name:'حالة الصنف',exact:true}).selectOption('off');
  await page.getByRole('button',{name:'حفظ وتأكيد',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('temo-v2-demo-only'))['products/demo-1']);
  assert.equal(saved.variants[0].sell,false);assert.equal(saved.variants[0].qty,4);assert.equal(saved.variants[0].cost,10800);assert.equal(saved.published,false);
  await page.evaluate(()=>{
   const k='temo-v2-demo-only',d=JSON.parse(localStorage.getItem(k)),p=d['products/demo-0'];
   for(let i=0;i<7;i++){const id='shelf-'+i;d['products/'+id]={...p,id,name:'Shelf Plant '+i,genus:i===6?'Hoya':'Alocasia'};}
   localStorage.setItem(k,JSON.stringify(d));
  });
  await page.reload();await page.getByRole('button',{name:'نباتاتي',exact:true}).click();
  const shelves=page.locator('.collection-shelf'),track=page.locator('.collection-track').first();
  assert.match(await shelves.nth(0).locator('.collection-shelf-head h2').innerText(),/Alocasia/);
  assert.match(await shelves.nth(1).locator('.collection-shelf-head h2').innerText(),/Hoya/);
  assert.match(await shelves.nth(2).locator('.collection-shelf-head h2').innerText(),/Anthurium/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await track.evaluate(e=>e.scrollWidth>e.clientWidth),true);
  await shelves.first().getByRole('button',{name:/التالي/}).click();
  assert.ok(await track.evaluate(e=>e.scrollLeft)<0,'RTL next scroll');
  await page.screenshot({path:path.join(out,'admin-shelves-'+viewport.width+'.png'),fullPage:true});
  await shelves.first().getByRole('button',{name:'عرض الكل',exact:true}).click();
  assert.equal(await page.locator('.collection-shelf').count(),0);
  assert.equal(await page.locator('.collection-card').count(),7);
  await page.getByRole('combobox',{name:'تصفية حسب النوع'}).selectOption('');
  assert.equal(await page.locator('.collection-shelf').count(),4);
  await page.getByRole('button',{name:'المشتريات والحركات',exact:true}).click();
  await page.getByRole('heading',{name:'المشتريات وتكاليف النباتات',exact:true}).waitFor();
  const purchasesLayout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,tables:[...document.querySelectorAll('.table-wrap')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth}))}));
  assert.equal(purchasesLayout.viewport,viewport.width,'purchases must not expand the viewport');
  assert.ok(purchasesLayout.width<=viewport.width,'purchases must not overflow the document');
  if(viewport.width===375)assert.ok(purchasesLayout.tables.some(t=>t.scroll>t.width),'wide tables scroll inside their containers');
  await page.screenshot({path:path.join(out,'admin-purchases-'+viewport.width+'.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log('PASS admin workflow '+viewport.width);
  await context.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
