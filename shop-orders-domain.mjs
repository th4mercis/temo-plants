import {assert,quantity,integerMoney,planOrder,publicProduct,localDate,dateValue} from './domain.js';
import {phoneNumber} from './customer-domain.js';
export function validateRequest(raw){
 assert(raw&&typeof raw==='object','طلب غير صالح.');
 const text=(key,max,required=true)=>{const s=String(raw[key]||'').trim();assert(s.length<=max&&(!required||s.length>0),'راجع حقل '+key);return s;};
 assert(/^[a-f0-9-]{36}$/i.test(raw.id||''),'معرف الطلب غير صالح.');
 assert(/^[a-f0-9-]{36}$/i.test(raw.token||''),'رمز المتابعة غير صالح.');
 assert(!raw.website,'تعذر إرسال الطلب.');assert(raw.consent===true,'وافق على استخدام بياناتك لمعالجة الطلب.');
 assert(Array.isArray(raw.items)&&raw.items.length>0&&raw.items.length<=20,'السلة تحتاج من 1 إلى 20 صنفاً.');
 const seen=new Set();const items=raw.items.map(i=>{assert(/^[\w-]{1,100}$/.test(i.productId)&&/^[\w-]{1,100}$/.test(i.variantId),'الصنف غير صالح.');const k=i.productId+'/'+i.variantId;assert(!seen.has(k),'الصنف مكرر.');seen.add(k);const qty=quantity(i.qty);assert(qty<=99,'الحد الأقصى 99 قطعة للصنف.');return {productId:i.productId,variantId:i.variantId,qty,price:integerMoney(i.price)};});
 return {id:raw.id,token:raw.token,name:text('name',120),phone:phoneNumber(raw.phone),city:text('city',120),notes:text('notes',1000,false),marketingConsent:raw.marketingConsent===true,items};
}
export function quoteRequest(input,products){
 const items=input.items.map(i=>{const p=products.find(p=>p?.id===i.productId);assert(p?.published&&!p.archived,'أحد النباتات لم يعد معروضاً.');const v=p.variants.find(v=>v.id===i.variantId);assert(v?.sell&&!v.hidden&&v.qty-v.reserved>=i.qty,'الكمية المطلوبة غير متاحة: '+p.name);assert(v.price>0,'سعر أحد الأصناف يحتاج مراجعة.');assert(v.price===i.price,'تغير سعر '+p.name+'؛ حدّث السلة ثم أرسل الطلب مجدداً.');return {...i,name:p.name,type:v.type,code:p.code};});
 const subtotal=items.reduce((s,i)=>s+i.qty*i.price,0);integerMoney(subtotal);return {items,subtotal};
}
export function approvalPlan(request,products,{shippingCharged,expires},now=new Date()){
 assert(request.status==='pending','تمت معالجة الطلب بالفعل.');integerMoney(shippingCharged);dateValue(expires);assert(expires>=localDate(now),'اختر تاريخ حجز صالحاً.');
 quoteRequest(request,products);const plan=planOrder(products,{items:request.items,shippingCharged,shippingCost:0},'reserve');
 const at=now.toISOString(),id=request.id;const order={id,number:request.number,customer:request.name,customerPhone:request.phone,customerId:'phone-'+request.phone,source:'المتجر',destination:request.city,notes:request.notes,date:localDate(now),expires,items:plan.items,subtotal:plan.subtotal,cogs:plan.cogs,total:plan.total,shippingCharged,shippingCost:0,paid:0,status:'reserved',fulfillment:'pending',revision:1,createdAt:at};
 const writes={['tp2_orders/'+id]:order};
 for(const p of plan.products){p.revision++;p.updatedAt=at;writes['tp2_products/'+p.id]=p;writes['tp2_publicProducts/'+p.id]=publicProduct(p);}
 plan.movements.forEach((m,i)=>writes['tp2_movements/'+id+'-web-'+i]={...m,id:id+'-web-'+i,orderId:id,date:order.date,at,by:'website-approval'});
 return {writes,order};
}
export function publicStatus(r){return {id:r.id,number:r.number,status:r.status,subtotal:r.subtotal,shippingCharged:r.shippingCharged??null,total:r.total??null,expires:r.expires||'',message:r.message||'',items:r.items.map(({name,type,qty,price})=>({name,type,qty,price}))};}
