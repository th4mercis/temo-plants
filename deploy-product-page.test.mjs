import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setProductRoutes} from './plant-routes.js';
setProductRoutes([{id:'plant-123',name:'Hoya <Princess>'}]);
import {createPageHandler} from './product-page-source.mjs';
const template=await readFile(new URL('./shop.html',import.meta.url),'utf8');
const event={path:'/plants/hoya-princess',httpMethod:'GET',queryStringParameters:{product:'plant-123',utm_source:'instagram'}};
const product={published:true,name:'Hoya <Princess>',image:'https://example.com/a.webp?a=1&b=2',description:'<script>alert(1)</script>',actualPhoto:true,cost:999,internalNotes:'PRIVATE'};
test('initial product HTML has one canonical, public metadata and visible escaped product without JS',async()=>{
 const r=await createPageHandler(template,async()=>product)(event);
 assert.equal(r.statusCode,200);assert.equal((r.body.match(/<h1[\s>]/g)||[]).length,1);assert.equal((r.body.match(/rel="canonical"/g)||[]).length,1);
 assert.match(r.body,/<link rel="canonical" href="https:\/\/temoplants.com\/plants\/hoya-princess">/);
 assert.match(r.body,/<h1>Hoya &lt;Princess&gt;<\/h1>/);assert.match(r.body,/data-server-product="plant-123"/);
 assert.match(r.body,/<meta property="og:title" content="Hoya &lt;Princess&gt; \| Temo Plants">/);
 assert.match(r.body,/id="catalog-view" hidden/);assert.match(r.body,/src="\/shop.js"/);
 assert.ok(!r.body.includes('PRIVATE'));assert.ok(!r.body.includes('<script>alert(1)</script>'));
 assert.equal((r.body.match(/<title>/g)||[]).length,1);
});
test('invalid/private/missing products and failures have correct status without leaking',async()=>{
 for(const p of [undefined,{...product,published:false}]) assert.equal((await createPageHandler(template,async()=>p)(event)).statusCode,404);
 const h=createPageHandler(template,()=>{throw Error('PRIVATE')});
 assert.equal((await h(event)).statusCode,503);assert.equal((await h({...event,path:'/shop.html',queryStringParameters:{product:'../bad'}})).statusCode,404);
 assert.equal((await h({...event,httpMethod:'POST'})).statusCode,405);
});
test('demo and catalogue skip database; HEAD has no body',async()=>{
 const h=createPageHandler(template,()=>{throw Error('must not read')});
 assert.equal((await h({...event,path:'/shop.html',queryStringParameters:{}})).body,template);
 assert.equal((await h({...event,path:'/shop.html',queryStringParameters:{demo:'1',product:'demo-0'}})).body,template);
 const r=await createPageHandler(template,async()=>product)({...event,httpMethod:'HEAD'});assert.equal(r.statusCode,200);assert.equal(r.body,'');
});
