import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './product-share-source.mjs';
import {headers} from './seo.mjs';
import {readFile} from 'node:fs/promises';
test('dynamic responses use the static CSP including frame protection without inline redirect scripts',async()=>{
 const staticHeaders=await readFile(new URL('./_headers',import.meta.url),'utf8');
 const policy=staticHeaders.match(/Content-Security-Policy: ([^\r\n]+)/)[1];assert.equal(headers()['Content-Security-Policy'],policy);assert.equal(headers()['X-Frame-Options'],'DENY');
 const event={httpMethod:'GET',queryStringParameters:{product:'test'}};
 for(const load of [async()=>({published:true,name:'Test'}),async()=>undefined,async()=>{throw Error();}]){
  const result=await createHandler(load)(event);assert.equal(result.headers['Content-Security-Policy'],policy);assert.ok(!result.body.includes('<script>location.replace'));}
 const ok=await createHandler(async()=>({published:true,name:'Test'}))(event);assert.match(ok.body,/src="\/share-redirect.js" defer/);
});
const event={httpMethod:'GET',queryStringParameters:{product:'plant-123'}};
test('crawler HTML includes escaped public plant metadata and actual image without running JS',async()=>{
 const r=await createHandler(async()=>({published:true,name:'Melo <Aurea>',description:'Reference "photo"',actualPhoto:false,image:'https://example.com/photo.jpg?a=1&b=2',internalNotes:'PRIVATE',cost:12345}))(event);
 assert.equal(r.statusCode,200);assert.match(r.body,/og:image" content="https:\/\/example.com\/photo.jpg\?a=1&amp;b=2/);assert.match(r.body,/Melo &lt;Aurea&gt;/);assert.match(r.body,/صورة مرجعية/);assert.ok(!r.body.includes('PRIVATE'));assert.match(r.body,/plants\/melo-aurea/);
});
test('unpublished and missing plants disclose no metadata',async()=>{for(const p of [undefined,{published:false,name:'SECRET'}]){const r=await createHandler(async()=>p)(event);assert.equal(r.statusCode,404);assert.ok(!r.body.includes('SECRET'));}});
test('bad IDs and methods avoid database reads; backend failure is not cached',async()=>{
 const h=createHandler(()=>{throw Error('private error')});assert.equal((await h({...event,httpMethod:'POST'})).statusCode,405);assert.equal((await h({...event,queryStringParameters:{product:'../../secret'}})).statusCode,404);const r=await h(event);assert.equal(r.statusCode,503);assert.ok(!r.body.includes('private error'));assert.equal(r.headers['Cache-Control'],'no-store');
});
