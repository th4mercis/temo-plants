import {queueNotification,tryNotification} from '../../order-notifications.mjs';
import {PublicError,parseBody,errorResponse,consumeLimit,requireRecentAdmin} from '../../security.mjs';
import {normalizeReceiptImage} from '../../receipt-image.mjs';
import {createHash} from 'node:crypto';
import {validateRequest,quoteRequest,approvalPlan,publicStatus,validateReceipt,receiptPaymentPlan} from '../../shop-orders-domain.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const reply=(statusCode,data)=>({statusCode,headers:{...(statusCode===429?{'Retry-After':'60'}:{}),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(data)});

async function setup(){const [{initializeApp,cert,getApps},{getFirestore},{getAuth}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth')]);const c=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'{}');if(c.project_id!=='temo-plants')throw new PublicError('config');const app=getApps().find(a=>a.name==='shop-temo')||initializeApp({credential:cert(c)},'shop-temo');return {db:getFirestore(app),auth:getAuth(app)};}
export function createHandler(load=setup){let context;return async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'استخدم نموذج الطلب.'});

 const origin=event.headers?.origin;if(!['https://temoplants.netlify.app','https://temoplants.com','https://www.temoplants.com'].includes(origin))return reply(403,{error:'أرسل الطلب من موقع المتجر.'});
 let body;try{body=parseBody(event);}catch(e){return reply(e.status||400,{error:e.message});}
 const actions=['create','my-orders','status','claim','receipt-submit','list','approve','reject','receipt-view','receipt-review','detail'];
 if(!actions.includes(body.action))return reply(400,{error:'عملية غير صالحة.'});
 if(['status','receipt-submit'].includes(body.action)&&!event.headers.authorization&&!/^[a-f0-9-]{36}$/i.test(body.token||''))return reply(403,{error:'سجّل الدخول لمتابعة طلبك.'});
 try{context||=await load();}catch{return reply(503,{error:'الطلبات غير متاحة مؤقتاً. أعد المحاولة لاحقاً.'});}
 const {db,auth}=context;
 let customer=null;
 async function verifiedCustomer(){if(customer)return customer;try{const h=event.headers.authorization||'';const u=await auth.verifyIdToken(h.replace(/^Bearer /,''),true);if(!u.email||u.email_verified!==true)throw new PublicError();customer=u;return u;}catch{throw new PublicError('سجّل الدخول بحساب العميل وأكد بريدك الإلكتروني.',401);}}
 async function mayRead(r){if(!r)return false;if(r.customerUid){try{return (await verifiedCustomer()).uid===r.customerUid;}catch{return false;}}return /^[a-f0-9-]{36}$/i.test(body.token||'')&&r.tokenHash===hash(body.token);}
 async function statusFor(r){const o=(await db.doc('tp2_orders/'+r.id).get()).data();if(o){r.paid=o.paid;r.fulfillment=o.fulfillment;const shipment=(await db.doc('tp2_shipments/'+o.id).get()).data();r.tracking=shipment?.tracking||'';r.carrier=shipment?.carrier||'';r.items=o.items;r.subtotal=o.subtotal;r.status=o.status==='reserved'?'approved':o.status;r.expires=o.expires;r.total=o.total;r.shippingCharged=o.shippingCharged;if(o.status!=='reserved')r.message='';}return publicStatus(r);}

 try{
 if(['status','receipt-submit'].includes(body.action)){
  if(event.headers.authorization){const u=await verifiedCustomer();await consumeLimit(db,'uid:'+u.uid,body.action,60);}
  else {const ip=event.headers['x-nf-client-connection-ip'];if(!ip)throw new PublicError('تعذر التحقق من الطلب.',403);await consumeLimit(db,'legacy:'+ip,body.action,20);}
 }
 if(body.action==='my-orders'){
  const u=await verifiedCustomer();await consumeLimit(db,'uid:'+u.uid,'my-orders',30);const rows=await db.collection('shopRequests').where('customerUid','==',u.uid).limit(100).get();
  const requests=await Promise.all(rows.docs.map(async d=>{const r=d.data();return {...await statusFor(r),createdAt:r.createdAt};}));requests.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return reply(200,{requests});
 }
 if(body.action==='claim'){
  const u=await verifiedCustomer();await consumeLimit(db,'uid:'+u.uid,'claim',10);if(!/^[a-f0-9-]{36}$/i.test(body.id||'')||!/^[a-f0-9-]{36}$/i.test(body.token||''))throw new PublicError('رابط المتابعة غير صالح.');
  await db.runTransaction(async tx=>{const ref=db.doc('shopRequests/'+body.id),r=(await tx.get(ref)).data();if(!r||r.tokenHash!==hash(body.token)||(r.customerUid&&r.customerUid!==u.uid))throw new PublicError('تعذر ربط الطلب بهذا الحساب.');r.customerUid=u.uid;r.customerEmail=u.email;r.tokenHash='';r.updatedAt=new Date().toISOString();tx.set(ref,r);});return reply(200,{linked:true});
 }
 if(['list' ,'approve','reject','receipt-view','receipt-review','detail'].includes(body.action)){
  let user;try{const h=event.headers.authorization||'';user=await auth.verifyIdToken(h.replace(/^Bearer /,''),true);if((await db.doc('admins/'+user.uid).get()).data()?.active!==true)throw new PublicError();}catch{return reply(403,{error:'سجّل الدخول بحساب مدير مخوّل.'});}
  requireRecentAdmin(user);await consumeLimit(db,'admin:'+user.uid,body.action,60);
  if(body.action==='detail'){
   if(!/^[a-f0-9-]{36}$/i.test(body.id||''))throw new PublicError('معرف غير صالح.');
   const r=(await db.doc('shopRequests/'+body.id).get()).data();if(!r)throw new PublicError('الطلب غير موجود.',404);
   const {tokenHash,receiptHashes,...clean}=r;const o=(await db.doc('tp2_orders/'+r.id).get()).data();return reply(200,{requests:[{...clean,...(o?{orderStatus:o.status,paid:o.paid,total:o.total,fulfillment:o.fulfillment}:{})}]});
  }
  if(body.action==='list'){
   const s=await db.collection('shopRequests').orderBy('createdAt','desc').limit(100).get();
   const requests=await Promise.all(s.docs.map(async d=>{const {tokenHash,receiptHashes,...r}=d.data();const o=(await db.doc('tp2_orders/'+r.id).get()).data();if(o)Object.assign(r,{orderStatus:o.status,paid:o.paid,total:o.total,fulfillment:o.fulfillment});return r;}));return reply(200,{requests});
  }
  if(['receipt-view','receipt-review'].includes(body.action)){
   if(!/^[a-f0-9-]{36}$/i.test(body.receiptId||''))throw new PublicError('معرف الإيصال غير صالح.');
   const rr=db.doc('shopReceipts/'+body.receiptId);
   if(body.action==='receipt-view'){const r=(await rr.get()).data();if(!r)throw new PublicError('الإيصال غير موجود.');return reply(200,{image:r.image,amount:r.amount,status:r.status});}
   if(!['confirm','reject'].includes(body.decision))throw new PublicError('قرار غير صالح.');
   const result=await db.runTransaction(async tx=>{
    const receipt=(await tx.get(rr)).data();if(!receipt)throw new PublicError('الإيصال غير موجود.');
    if(receipt.status!=='pending')return {status:receipt.status};
    const ref=db.doc('shopRequests/'+receipt.orderId),request=(await tx.get(ref)).data(),o=(await tx.get(db.doc('tp2_orders/'+receipt.orderId))).data();
    const at=new Date().toISOString();let reason=String(body.reason||'').trim().slice(0,500);
    if(body.decision==='confirm'){
     if(!o)throw new PublicError('الطلب غير موجود.');
     const ps=await Promise.all([...new Set(o.items.map(i=>i.productId))].map(id=>tx.get(db.doc('tp2_products/'+id))));
     const plan=receiptPaymentPlan(o,receipt,ps.map(p=>p.data()),user.uid);for(const [path,value]of Object.entries(plan.writes))tx.set(db.doc(path),value);
    }else if(!reason)throw new PublicError('سبب رفض الإيصال مطلوب.');
    receipt.status=body.decision==='confirm'?'confirmed':'rejected';receipt.reviewedAt=at;receipt.reviewedBy=user.uid;receipt.reason=reason;tx.set(rr,receipt);
    if(body.decision==='reject'&&o){o.pendingReceipt='';o.revision++;tx.set(db.doc('tp2_orders/'+o.id),o);}
    request.receipt={id:receipt.id,amount:receipt.amount,status:receipt.status,reason};request.updatedAt=at;tx.set(ref,request);
    tx.set(db.doc('tp2_audit/'+receipt.id+'-review'),{id:receipt.id+'-review',kind:'receipt-review',details:receipt.orderId,decision:body.decision,reason,by:user.uid,at});return {status:receipt.status};
   });return reply(200,result);
  }
  if(!/^[a-f0-9-]{36}$/i.test(body.id||''))throw new PublicError('معرف غير صالح.');
  const result=await db.runTransaction(async tx=>{const ref=db.doc('shopRequests/'+body.id),r=(await tx.get(ref)).data();if(!r)throw new PublicError('الطلب غير موجود.');if(r.status!=='pending')return publicStatus(r);
   const at=new Date().toISOString();
   if(body.action==='reject'){r.status='rejected';r.message=String(body.message||'نعتذر، تعذر تأكيد الطلب.').slice(0,500);r.updatedAt=at;tx.set(ref,r);tx.set(db.doc('tp2_audit/'+r.id+'-reject'),{id:r.id+'-reject',kind:'web-reject',details:r.number,by:user.uid,at});return publicStatus(r);}
   if((await tx.get(db.doc('tp2_orders/'+r.id))).exists)throw new PublicError('يوجد طلب سابق بهذا المعرف؛ راجع الطلبات والمبيعات.');
   const ids=[...new Set(r.items.map(i=>i.productId))];const snaps=await Promise.all(ids.map(id=>tx.get(db.doc('tp2_products/'+id))));const cr=db.doc('tp2_customers/phone-'+r.phone),customer=(await tx.get(cr)).data();
   const plan=approvalPlan(r,snaps.map(s=>s.data()),body);for(const [path,value]of Object.entries(plan.writes))tx.set(db.doc(path),value);
   if(!customer)tx.set(cr,{id:'phone-'+r.phone,name:r.name,phone:r.phone,city:r.city,notes:'',marketingConsent:r.marketingConsent,consentUpdatedAt:r.createdAt,revision:1,updatedAt:at});
   r.paymentInstructions=String(body.paymentInstructions||'').trim().slice(0,1500);r.status='approved';r.shippingCharged=body.shippingCharged;r.total=plan.order.total;r.expires=body.expires;r.updatedAt=at;r.message='تم تأكيد الطلب وحجزه. سنتواصل معك لترتيب الدفع.';tx.set(ref,r);tx.set(db.doc('tp2_audit/'+r.id+'-approve'),{id:r.id+'-approve',kind:'web-approve',details:r.number,by:user.uid,at});return publicStatus(r);
  });return reply(200,result);
 }
 if(body.action==='receipt-submit'){
  if(!/^[a-f0-9-]{36}$/i.test(body.id||''))throw new PublicError('رابط المتابعة غير صالح.');
  const initial=(await db.doc('shopRequests/'+body.id).get()).data();if(!await mayRead(initial))throw new PublicError('ليس لديك صلاحية لهذا الطلب.',403);
  body.image=await normalizeReceiptImage(body.image);
  const result=await db.runTransaction(async tx=>{
   const ref=db.doc('shopRequests/'+body.id),r=(await tx.get(ref)).data();if(!await mayRead(r))throw new PublicError('سجّل الدخول بالحساب صاحب الطلب أو افتح رابط المتابعة القديم الصحيح.');
   const o=(await tx.get(db.doc('tp2_orders/'+body.id))).data();const receipt=validateReceipt(body,o),rr=db.doc('shopReceipts/'+receipt.id),old=(await tx.get(rr)).data();
   if(old){if(old.orderId!==r.id||old.image!==receipt.image||old.amount!==receipt.amount)throw new PublicError('معرف مكرر.');return {status:old.status};}
   if(r.receipt?.status==='pending')throw new PublicError('يوجد إيصال بانتظار المراجعة.');
   const imageHash=hash(receipt.image);if((r.receiptHashes||[]).includes(imageHash))throw new PublicError('سبق إرسال هذا الإيصال؛ اختر إيصال التحويل الجديد.');
   if((r.receiptHashes||[]).length>=20)throw new PublicError('وصلت لحد الإيصالات لهذا الطلب؛ تواصل مع المتجر.');
   const at=new Date().toISOString();o.pendingReceipt=receipt.id;o.revision++;tx.set(db.doc('tp2_orders/'+o.id),o);tx.set(rr,{...receipt,orderId:r.id,status:'pending',createdAt:at});r.receiptHashes=[...(r.receiptHashes||[]),imageHash];r.receipt={id:receipt.id,amount:receipt.amount,status:'pending'};r.updatedAt=at;tx.set(ref,r);queueNotification(tx,db,{id:'receipt-'+receipt.id,kind:'receipt',number:r.number});return {status:'pending'};
  });return reply(200,result);
 }
 if(body.action==='status'){
  if(!/^[a-f0-9-]{36}$/i.test(body.id||''))return reply(404,{error:'الطلب غير متاح.'});
  const r=(await db.doc('shopRequests/'+body.id).get()).data();if(!await mayRead(r))return reply(403,{error:'سجّل الدخول بالحساب صاحب الطلب أو افتح رابط المتابعة القديم الصحيح.'});
  return reply(200,await statusFor(r));
 }
 if(body.action!=='create')throw new PublicError('عملية غير صالحة.');const owner=await verifiedCustomer();await consumeLimit(db,'uid:'+owner.uid,'create',10);const input=validateRequest(body);
 const result=await db.runTransaction(async tx=>{const ref=db.doc('shopRequests/'+input.id),old=(await tx.get(ref)).data();if(old){if(old.customerUid!==owner.uid||old.tokenHash!==hash(input.token))throw new PublicError('معرف مكرر.');return publicStatus(old);}
  const ip=event.headers['x-nf-client-connection-ip'];if(!ip)throw new PublicError('تعذر التحقق من الطلب.');const day=new Date().toISOString().slice(0,10);const rateRefs=['ip-'+hash(ip),'phone-'+hash(input.phone),'uid-'+hash(owner.uid)].map(k=>db.doc('shopRequestLimits/'+day+'-'+k));const rates=await Promise.all(rateRefs.map(r=>tx.get(r)));if(rates.some(s=>(s.data()?.count||0)>=10)){throw new PublicError('وصلت للحد اليومي للطلبات. حاول لاحقاً.',429);}
  const ids=[...new Set(input.items.map(i=>i.productId))],ps=await Promise.all(ids.map(id=>tx.get(db.doc('tp2_products/'+id))));const quoted=quoteRequest(input,ps.map(s=>s.data()));const {token,...clean}=input;const at=new Date().toISOString();const r={...clean,...quoted,customerUid:owner.uid,customerEmail:owner.email,tokenHash:hash(token),number:'WEB-'+input.id.slice(0,8).toUpperCase(),status:'pending',shippingCharged:null,total:null,createdAt:at,updatedAt:at};tx.set(ref,r);queueNotification(tx,db,{id:'order-'+input.id,kind:'order',number:r.number});rateRefs.forEach((ref,i)=>tx.set(ref,{count:(rates[i].data()?.count||0)+1,expiresAt:new Date(Date.now()+172800000)}));return publicStatus(r);
 });return reply(200,result);
 }catch(e){const result=errorResponse(e,body.action);return reply(result.status,result.data);}
}

}
export const handler=createHandler();

export const config={rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain']}};
