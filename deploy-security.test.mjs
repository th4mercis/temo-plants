import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {parseBody,consumeLimit} from './security.mjs';
import {normalizeReceiptImage} from './receipt-image.mjs';
import {createHandler as shopHandler} from './netlify/functions/shop-orders.mjs';
import {createHandler as adminHandler} from './netlify/functions/admin-commands.mjs';
function fixture(){
 const data=new Map([['admins/owner',{active:true}],['tp2_products/p',{id:'p',code:'P',name:'Test',genus:'Hoya',publicDescription:'',revision:1,published:true,variants:[{id:'v',type:'كتنج',qty:2,reserved:0,cost:200,price:500,sell:true}]}]]);
 const snap=p=>({exists:data.has(p),data:()=>structuredClone(data.get(p))});
 const db={doc:p=>({path:p,get:async()=>snap(p)}),collection:c=>({get:async()=>({docs:[...data].filter(([k])=>k.startsWith(c+'/')).map(([k])=>snap(k))})}),runTransaction:async fn=>{const writes=[];const result=await fn({get:async r=>snap(r.path),set:(r,v)=>writes.push([r.path,structuredClone(v)])});for(const [k,v]of writes)data.set(k,v);return result;}};
 const auth={verifyIdToken:async t=>{if(!t)throw Error();return {uid:t,email_verified:true,email:t+'@example.test'};}};
 const handler=adminHandler(async()=>({db,auth}));
 const call=async(action,args,user='owner')=>{const r=await handler({httpMethod:'POST',headers:{origin:'https://temoplants.com',authorization:'Bearer '+user},body:JSON.stringify({action,args})});return {status:r.statusCode,...JSON.parse(r.body)};};
 return {data,db,call};
}
test('JSON object and decoded byte size enforced before DB initialization',async()=>{
 for(const body of ['null','[]','true','"text"','{'])assert.throws(()=>parseBody({body}));
 assert.throws(()=>parseBody({body:JSON.stringify({x:'ع'.repeat(10)})},15));
 assert.deepEqual(parseBody({body:Buffer.from('{"x":1}').toString('base64'),isBase64Encoded:true}),{x:1});
 let initialized=0;const handler=shopHandler(async()=>{initialized++;throw Error();});
 const r=await handler({httpMethod:'POST',headers:{origin:'https://temoplants.com'},body:JSON.stringify({action:'status',id:'00000000-0000-4000-8000-000000000000'})});
 assert.equal(r.statusCode,403);assert.equal(initialized,0);
});
test('shared rate limit denies excess calls and resets; identities isolated',async()=>{
 const {db}=fixture();await consumeLimit(db,'a','status',2,60001);await consumeLimit(db,'a','status',2,60002);
 await assert.rejects(consumeLimit(db,'a','status',2,60003),e=>e.status===429);
 await consumeLimit(db,'b','status',2,60003);await consumeLimit(db,'a','status',2,120001);
});
test('server decodes image, rejects marker-only data, and strips EXIF',async()=>{
 const bad=Buffer.alloc(100,1);bad.set([255,216,255]);bad.set([255,217],98);
 await assert.rejects(normalizeReceiptImage('data:image/jpeg;base64,'+bad.toString('base64')));
 const image=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).jpeg().withMetadata().toBuffer();
 const result=await normalizeReceiptImage('data:image/jpeg;base64,'+image.toString('base64'));
 const metadata=await sharp(Buffer.from(result.split(',')[1],'base64')).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);
});
test('admin command rejects customer and method injection without business writes',async()=>{
 const {data,call}=fixture();const before=JSON.stringify([...data]);
 assert.equal((await call('saveProduct',[data.get('tp2_products/p'),'op'],'customer')).status,403);
 assert.equal((await call('__proto__',[{}])).status,400);assert.equal(JSON.stringify([...data]),before);
});
test('server sale, retry, payment and audit use authoritative inventory and identity',async()=>{
 const {data,call}=fixture();const input={customer:'Test',date:'2026-10-04',paid:0,shippingCharged:0,shippingCost:0,items:[{productId:'p',variantId:'v',qty:1,price:500}]};
 assert.equal((await call('createOrder',[input,'sell','op'])).status,200);
 assert.equal((await call('createOrder',[input,'sell','op'])).status,200);
 assert.equal(data.get('tp2_products/p').variants[0].qty,1);
 assert.equal(data.get('tp2_audit/op').by,'owner');
 const order=data.get('tp2_orders/op');assert.equal((await call('orderAction',[order,'payment',{amount:200},'pay'])).status,200);
 assert.equal(data.get('tp2_orders/op').paid,200);assert.equal(data.get('tp2_cash/pay').amount,200);
 assert.equal((await call('orderAction',[order,'payment',{amount:200},'stale'])).status,400);
});
test('server refuses path traversal and does not accept stock edits via saveProduct',async()=>{
 const {data,call}=fixture();const p=data.get('tp2_products/p');
 assert.equal((await call('saveProduct',[{...p,id:'../admins'},'edit'])).status,400);
 const changed=structuredClone(p);changed.variants[0].qty=999;
 assert.equal((await call('saveProduct',[changed,'edit'])).status,200);
 assert.equal(data.get('tp2_products/p').variants[0].qty,2);
});
