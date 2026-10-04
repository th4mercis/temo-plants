import sharp from 'sharp';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './netlify/functions/shop-orders.mjs';
import {createHash} from 'node:crypto';
const id='11111111-1111-4111-8111-111111111111',token='22222222-2222-4222-8222-222222222222',receiptId='33333333-3333-4333-8333-333333333333';
const bytes=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).jpeg().toBuffer();const image='data:image/jpeg;base64,'+bytes.toString('base64');
function fixture(){
 const docs=new Map(Object.entries({['admins/admin']:{active:true},['shopRequests/'+id]:{id,tokenHash:createHash('sha256').update(token).digest('hex'),status:'approved',number:'WEB-T',items:[]},['tp2_orders/'+id]:{id,number:'WEB-T',status:'sold',total:10000,paid:0,revision:1,items:[],fulfillment:'pending'}}));
 const snap=path=>({data:()=>structuredClone(docs.get(path)),exists:docs.has(path)});const db={doc:path=>({path,get:async()=>snap(path)}),runTransaction:async fn=>{const writes=[];const result=await fn({get:async ref=>snap(ref.path),set:(ref,data)=>writes.push([ref.path,structuredClone(data)])});writes.forEach(([k,v])=>docs.set(k,v));return result;}};
 const handler=createHandler(async()=>({db,auth:{verifyIdToken:async t=>{if(t!=='admin-token')throw Error();return {uid:'admin'};}}}));
 const call=async(body,admin=false)=>{const r=await handler({httpMethod:'POST',headers:{origin:'https://temoplants.netlify.app','x-nf-client-connection-ip':'192.0.2.1',...(admin?{authorization:'Bearer admin-token'}:{})},body:JSON.stringify(body)});return {code:r.statusCode,...JSON.parse(r.body)};};return {docs,call};
}
const submit={action:'receipt-submit',id,token,receiptId,amount:4000,image};
test('receipt is mandatory, token protected, amount bounded; no writes on rejection',async()=>{
 for(const patch of [{image:''},{token:id},{amount:10001},{image:'data:image/svg+xml;base64,AAAA'}]){const {docs,call}=fixture(),before=JSON.stringify([...docs].filter(([k])=>!k.startsWith('shopRequestLimits/')));assert.ok([400,403].includes((await call({...submit,...patch})).code));assert.equal(JSON.stringify([...docs].filter(([k])=>!k.startsWith('shopRequestLimits/'))),before);}
});
test('submission does not book money; retry and confirmation are idempotent',async()=>{
 const {docs,call}=fixture();assert.equal((await call(submit)).status,'pending');assert.equal((await call(submit)).status,'pending');assert.equal(docs.get('tp2_orders/'+id).paid,0);assert.equal([...docs.keys()].filter(k=>k.startsWith('tp2_cash')).length,0);
 assert.equal((await call({action:'receipt-view',receiptId})).code,403);
 const action={action:'receipt-review',receiptId,decision:'confirm'};assert.equal((await call(action,true)).status,'confirmed');assert.equal((await call(action,true)).status,'confirmed');assert.equal(docs.get('tp2_orders/'+id).paid,4000);assert.equal([...docs.keys()].filter(k=>k.startsWith('tp2_cash')).length,1);
 assert.equal((await call({...submit,receiptId:'44444444-4444-4444-8444-444444444444'})).code,400);
});
test('rejection records reason without payment and allows a new receipt',async()=>{
 const {docs,call}=fixture();await call(submit);assert.equal((await call({action:'receipt-review',receiptId,decision:'reject'},true)).code,400);assert.equal((await call({action:'receipt-review',receiptId,decision:'reject',reason:'غير واضح'},true)).status,'rejected');assert.equal(docs.get('tp2_orders/'+id).paid,0);
});
test('changed balance and cancelled order block confirmation atomically',async()=>{
 for(const patch of [{paid:8000},{status:'cancelled'}]){const {docs,call}=fixture();await call(submit);Object.assign(docs.get('tp2_orders/'+id),patch);assert.equal((await call({action:'receipt-review',receiptId,decision:'confirm'},true)).code,400);assert.equal(docs.get('shopReceipts/'+receiptId).status,'pending');assert.equal([...docs.keys()].filter(k=>k.startsWith('tp2_cash')).length,0);}
});

test('receipt confirmation fulfills a reservation once with correct stock and partial balance',async()=>{
 const {docs,call}=fixture();const p={id:'p',name:'Test',publicDescription:'',code:'T',genus:'Hoya',revision:1,published:true,variants:[{id:'v',type:'كتنج',qty:3,reserved:1,price:10000,cost:2000,value:6000,sell:true}]};docs.set('tp2_products/p',p);Object.assign(docs.get('tp2_orders/'+id),{status:'reserved',items:[{productId:'p',variantId:'v',qty:1,price:10000}],shippingCost:0,shippingCharged:0});
 await call(submit);assert.equal(docs.get('tp2_products/p').variants[0].qty,3);const result=await call({action:'receipt-review',receiptId,decision:'confirm'},true);assert.equal(result.code,200,JSON.stringify(result));assert.equal(docs.get('tp2_products/p').variants[0].qty,2);assert.equal(docs.get('tp2_products/p').variants[0].reserved,0);assert.equal(docs.get('tp2_orders/'+id).paid,4000);assert.equal(docs.get('tp2_orders/'+id).pendingReceipt,'');
});
