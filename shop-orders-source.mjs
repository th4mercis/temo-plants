import {createHash} from 'node:crypto';
import {validateRequest,quoteRequest,approvalPlan,publicStatus} from '../../shop-orders-domain.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(data)});
let context;
async function setup(){const [{initializeApp,cert,getApps},{getFirestore},{getAuth}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth')]);const c=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'{}');if(c.project_id!=='temo-plants')throw Error('config');const app=getApps().find(a=>a.name==='shop-temo')||initializeApp({credential:cert(c)},'shop-temo');return {db:getFirestore(app),auth:getAuth(app)};}
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'استخدم نموذج الطلب.'});
 if((event.body||'').length>20000)return reply(413,{error:'الطلب كبير جداً.'});
 const origin=event.headers?.origin;if(origin!=='https://temoplants.netlify.app')return reply(403,{error:'أرسل الطلب من موقع المتجر.'});
 let body;try{body=JSON.parse(event.body||'{}');}catch{return reply(400,{error:'طلب غير صالح.'});}
 try{context||=await setup();}catch{return reply(503,{error:'الطلبات غير متاحة مؤقتاً. أعد المحاولة لاحقاً.'});}
 const {db,auth}=context;
 try{
 if(['list','approve','reject'].includes(body.action)){
  let user;try{const h=event.headers.authorization||'';user=await auth.verifyIdToken(h.replace(/^Bearer /,''),true);if((await db.doc('admins/'+user.uid).get()).data()?.active!==true)throw Error();}catch{return reply(403,{error:'سجّل الدخول بحساب مدير مخوّل.'});}
  if(body.action==='list'){const s=await db.collection('shopRequests').where('status','==',body.status==='processed'?'approved':'pending').limit(100).get();return reply(200,{requests:s.docs.map(d=>{const {tokenHash,...r}=d.data();return r;})});}
  if(!/^[a-f0-9-]{36}$/i.test(body.id||''))throw Error('معرف غير صالح.');
  const result=await db.runTransaction(async tx=>{const ref=db.doc('shopRequests/'+body.id),r=(await tx.get(ref)).data();if(!r)throw Error('الطلب غير موجود.');if(r.status!=='pending')return publicStatus(r);
   const at=new Date().toISOString();
   if(body.action==='reject'){r.status='rejected';r.message=String(body.message||'نعتذر، تعذر تأكيد الطلب.').slice(0,500);r.updatedAt=at;tx.set(ref,r);tx.set(db.doc('tp2_audit/'+r.id+'-reject'),{id:r.id+'-reject',kind:'web-reject',details:r.number,by:user.uid,at});return publicStatus(r);}
   if((await tx.get(db.doc('tp2_orders/'+r.id))).exists)throw Error('يوجد طلب سابق بهذا المعرف؛ راجع الطلبات والمبيعات.');
   const ids=[...new Set(r.items.map(i=>i.productId))];const snaps=await Promise.all(ids.map(id=>tx.get(db.doc('tp2_products/'+id))));const cr=db.doc('tp2_customers/phone-'+r.phone),customer=(await tx.get(cr)).data();
   const plan=approvalPlan(r,snaps.map(s=>s.data()),body);for(const [path,value]of Object.entries(plan.writes))tx.set(db.doc(path),value);
   if(!customer)tx.set(cr,{id:'phone-'+r.phone,name:r.name,phone:r.phone,city:r.city,notes:'',marketingConsent:r.marketingConsent,consentUpdatedAt:r.createdAt,revision:1,updatedAt:at});
   r.status='approved';r.shippingCharged=body.shippingCharged;r.total=plan.order.total;r.expires=body.expires;r.updatedAt=at;r.message='تم تأكيد الطلب وحجزه. سنتواصل معك لترتيب الدفع.';tx.set(ref,r);tx.set(db.doc('tp2_audit/'+r.id+'-approve'),{id:r.id+'-approve',kind:'web-approve',details:r.number,by:user.uid,at});return publicStatus(r);
  });return reply(200,result);
 }
 if(body.action==='status'){
  if(!/^[a-f0-9-]{36}$/i.test(body.id||'')||!/^[a-f0-9-]{36}$/i.test(body.token||''))return reply(404,{error:'رابط المتابعة غير صالح.'});
  const r=(await db.doc('shopRequests/'+body.id).get()).data();if(!r||r.tokenHash!==hash(body.token))return reply(404,{error:'رابط المتابعة غير صالح.'});
  const o=(await db.doc('tp2_orders/'+body.id).get()).data();if(o){r.items=o.items;r.subtotal=o.subtotal;r.status=o.status==='reserved'?'approved':o.status;r.expires=o.expires;r.total=o.total;r.shippingCharged=o.shippingCharged;if(o.status!=='reserved')r.message='';}return reply(200,publicStatus(r));
 }
 if(body.action!=='create')throw Error('عملية غير صالحة.');const input=validateRequest(body);
 const result=await db.runTransaction(async tx=>{const ref=db.doc('shopRequests/'+input.id),old=(await tx.get(ref)).data();if(old){if(old.tokenHash!==hash(input.token))throw Error('معرف مكرر.');return publicStatus(old);}
  const ip=event.headers['x-nf-client-connection-ip'];if(!ip)throw Error('تعذر التحقق من الطلب.');const day=new Date().toISOString().slice(0,10);const rateRefs=['ip-'+hash(ip),'phone-'+hash(input.phone)].map(k=>db.doc('shopRequestLimits/'+day+'-'+k));const rates=await Promise.all(rateRefs.map(r=>tx.get(r)));if(rates.some(s=>(s.data()?.count||0)>=10)){const e=Error('وصلت للحد اليومي للطلبات. حاول لاحقاً.');e.status=429;throw e;}
  const ids=[...new Set(input.items.map(i=>i.productId))],ps=await Promise.all(ids.map(id=>tx.get(db.doc('tp2_products/'+id))));const quoted=quoteRequest(input,ps.map(s=>s.data()));const {token,...clean}=input;const at=new Date().toISOString();const r={...clean,...quoted,tokenHash:hash(token),number:'WEB-'+input.id.slice(0,8).toUpperCase(),status:'pending',shippingCharged:null,total:null,createdAt:at,updatedAt:at};tx.set(ref,r);rateRefs.forEach((ref,i)=>tx.set(ref,{count:(rates[i].data()?.count||0)+1,expiresAt:new Date(Date.now()+172800000)}));return publicStatus(r);
 });return reply(200,result);
 }catch(e){return reply(e.status||400,{error:e.code?'تعذر تنفيذ العملية. أعد المحاولة.':e.message||'تعذر إرسال الطلب.'});}
}
