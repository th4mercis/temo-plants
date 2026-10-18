import test from 'node:test';
import assert from 'node:assert/strict';
import {productMeta} from './seo.mjs';
import {createPageHandler} from './product-page-source.mjs';
import {createSitemapHandler} from './sitemap-source.mjs';
import {t,language} from './shop-i18n.js';
test('English customer UI keeps admin Arabic and respects explicit language',()=>{
 globalThis.document={body:{classList:{contains:()=>true}}};globalThis.location={search:'?lang=en'};
 assert.equal(language(),'en');assert.equal(t('سلة الطلب'),'Cart');assert.equal(t('البريد الإلكتروني'),'Email address');assert.equal(t('customer-entered text'),'customer-entered text');
 location.search='?lang=ar';assert.equal(t('سلة الطلب'),'سلة الطلب');location.search='?lang=en';document.body.classList.contains=()=>false;assert.equal(t('سلة الطلب'),'سلة الطلب');
 delete globalThis.document;delete globalThis.location;
 const meta=productMeta({name:'Hoya',variants:[{price:25000,available:1}]},'x','en');assert.match(meta.description,/250 SAR.*In stock/);
});
test('offers convert halalas, prefer in-stock variants and never invent zero prices',()=>{
 const p={name:'Hoya </script><script>bad</script>',variants:[{price:25000,available:2},{price:9000,available:0},{price:0,available:1}]};
 const m=productMeta(p,'x');assert.equal(m.data.offers.length,1);assert.equal(m.data.offers[0].price,250);assert.match(m.description,/250 ر.س/);assert.match(m.data.offers[0].availability,/InStock$/);assert.ok(!m.head.includes('</script><script>bad'));
 const sold=productMeta({...p,variants:[{price:25000,available:0}]},'x');assert.match(sold.data.offers[0].availability,/OutOfStock$/);assert.match(sold.description,/غير متوفر/);
 assert.ok(!productMeta({...p,variants:[{price:0,available:1}]},'x').data.offers);
});
test('CDN cache is bounded and separates product and demo; failures stay uncached',async()=>{
 const h=createPageHandler('template',async()=>({published:true,name:'test'}));
 const e={httpMethod:'GET',queryStringParameters:{product:'x'}};
 const p=await h(e);assert.match(p.headers['Netlify-CDN-Cache-Control'],/s-maxage=300$/);assert.equal(p.headers['Netlify-Vary'],'query=product|demo|lang');
 const demo=await h({...e,queryStringParameters:{demo:'1',product:'x'}});assert.equal(demo.body,'template');assert.match(demo.headers['Netlify-CDN-Cache-Control'],/3600$/);
 const missing=await createPageHandler('template',async()=>undefined)(e);assert.equal(missing.statusCode,404);assert.ok(!missing.headers['Netlify-CDN-Cache-Control']);assert.match(missing.body,/العودة للمتجر/);
});
test('sitemap uses canonical product links, escapes IDs and fails closed',async()=>{
 const e={httpMethod:'GET'};const r=await createSitemapHandler(async()=>['a','b&c'])(e);
 assert.equal(r.statusCode,200);assert.match(r.body,/shop.html\?product=a/);assert.match(r.body,/product=b%26c/);assert.ok(!r.body.includes('share.html'));assert.match(r.headers['Netlify-CDN-Cache-Control'],/3600$/);
 assert.equal((await createSitemapHandler(()=>{throw Error('secret');})(e)).statusCode,503);
 assert.equal((await createSitemapHandler(()=>{throw Error('should not run');})({httpMethod:'POST'})).statusCode,405);
});
