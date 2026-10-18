import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './product-share-source.mjs';
const event={httpMethod:'GET',queryStringParameters:{product:'plant-123'}};
test('crawler HTML includes escaped public plant metadata and actual image without running JS',async()=>{
 const r=await createHandler(async()=>({published:true,name:'Melo <Aurea>',description:'Reference "photo"',actualPhoto:false,image:'https://example.com/photo.jpg?a=1&b=2',internalNotes:'PRIVATE',cost:12345}))(event);
 assert.equal(r.statusCode,200);assert.match(r.body,/og:image" content="https:\/\/example.com\/photo.jpg\?a=1&amp;b=2/);assert.match(r.body,/Melo &lt;Aurea&gt;/);assert.match(r.body,/صورة مرجعية/);assert.ok(!r.body.includes('PRIVATE'));assert.match(r.body,/plants\/melo-aurea/);
});
test('unpublished and missing plants disclose no metadata',async()=>{for(const p of [undefined,{published:false,name:'SECRET'}]){const r=await createHandler(async()=>p)(event);assert.equal(r.statusCode,404);assert.ok(!r.body.includes('SECRET'));}});
test('bad IDs and methods avoid database reads; backend failure is not cached',async()=>{
 const h=createHandler(()=>{throw Error('private error')});assert.equal((await h({...event,httpMethod:'POST'})).statusCode,405);assert.equal((await h({...event,queryStringParameters:{product:'../../secret'}})).statusCode,404);const r=await h(event);assert.equal(r.statusCode,503);assert.ok(!r.body.includes('private error'));assert.equal(r.headers['Cache-Control'],'no-store');
});
