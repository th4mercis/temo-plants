import {effectivePurchase} from './purchase-cost.js';
import {phoneNumber} from './customer-domain.js';
import * as D from './domain.js';
export function createServices(store){
const now=()=>new Date().toISOString();
// One transaction for the plant, stock, purchase and payment: retries cannot duplicate them.
async function receivePlant(input,receipt,op=D.id()){
  D.validateProduct(input);D.quantity(receipt.qty);D.integerMoney(receipt.unitCost);D.integerMoney(receipt.landed||0);D.dateValue(receipt.date);
  D.assert(['purchase','opening','production'].includes(receipt.kind),'نوع الإضافة غير صالح.');
  const path='products/'+input.id;
  return store.atomic([path,'audit/'+op],docs=>{
    if(docs['audit/'+op])return {result:input.id};
    const old=docs[path];let p;
    if(receipt.kind==='production'){
      D.assert(old&&!old.archived,'النبتة غير موجودة.');D.assert(old.revision===input.revision,'تغيرت النبتة. أعد فتح إضافة الإنتاج.');p=structuredClone(old);
      let v=p.variants.find(v=>v.id===receipt.variantId)||p.variants.find(v=>!D.variantHidden(v)&&v.type.trim().toLowerCase()===String(receipt.type||'').trim().toLowerCase())||p.variants.find(v=>v.type.trim().toLowerCase()===String(receipt.type||'').trim().toLowerCase());if(v)receipt={...receipt,variantId:v.id};
      if(!v){D.assert(receipt.type?.trim(),'اسم الصنف مطلوب.');D.assert(!p.variants.some(v=>v.type.trim()===receipt.type.trim()),'الصنف موجود؛ اختره من القائمة.');v={id:receipt.variantId,type:receipt.type.trim(),qty:0,reserved:0,cost:0,price:0,sell:false};p.variants.push(v);}
      D.integerMoney(receipt.price);v.price=receipt.price;v.sell=!!receipt.sell;v.hidden=false;if(v.sell)p.published=true;
    }else{D.assert(!old,'هذه النبتة موجودة بالفعل.');D.assert(input.variants.every(v=>v.qty===0&&v.reserved===0),'النبتة الجديدة تبدأ بصفر قبل تسجيل الاستلام.');p=structuredClone(input);}
    const received=D.receiveStock(p,receipt.variantId,receipt.qty,receipt.unitCost,receipt.landed||0);p=received.product;
    const amount=received.total;D.integerMoney(amount);
    const writes={...productWrites([p]),['audit/'+op]:audit(op,receipt.kind,p.id),['movements/'+op]:{id:op,productId:p.id,variantId:receipt.variantId,kind:receipt.kind,qty:receipt.qty,reason:receipt.reason||'إضافة من بطاقة النبتة',date:receipt.date,by:store.uid(),at:now()}};
    if(receipt.kind==='purchase')writes['purchases/'+op]={id:op,productId:p.id,variantId:receipt.variantId,qty:receipt.qty,unitCost:receipt.unitCost,landed:receipt.landed||0,total:amount,supplier:receipt.reason||'',date:receipt.date};
    if(receipt.kind!=='opening'&&amount>0)writes['cash/'+op]={id:op,direction:'out',category:receipt.kind,amount,date:receipt.date,reference:op};
    return {writes,result:p.id};
  });
}
function audit(op,kind,details){return {id:op,kind,details,by:store.uid(),at:now()};}
function bump(p){p.revision=(p.revision||0)+1;p.updatedAt=now();return p;}
function productWrites(ps){const w={};for(const p of ps){bump(p);w['products/'+p.id]=p;w['publicProducts/'+p.id]=D.publicProduct(p);}return w;}
async function saveProduct(input,op=D.id()){
  D.validateProduct(input);const path='products/'+input.id;
  return store.atomic([path,'audit/'+op],docs=>{if(docs['audit/'+op])return {result:input.id};const old=docs[path];D.assert(!old||old.revision===input.revision,'تغيرت النبتة على جهاز آخر. أغلق النموذج وأعد فتحه.');const p=structuredClone(input);
    if(old){D.assert(old.variants.every(v=>p.variants.some(x=>x.id===v.id)),'لا يمكن إزالة صنف له تاريخ؛ أوقف عرضه بدلاً من حذفه.');p.code=old.code;p.variants.forEach(v=>{const prev=old.variants.find(x=>x.id===v.id);if(prev){v.qty=prev.qty;v.reserved=prev.reserved;v.cost=prev.cost;v.value=D.stockValue(prev);v.hidden=!!prev.hidden;if(D.variantHidden(v))v.sell=false;}else{D.assert(v.qty===0&&v.reserved===0&&v.cost===0,'الصنف الجديد يبدأ برصيد صفر.');v.value=0;}});if(p.archived)D.assert(p.variants.every(v=>v.qty===0&&v.reserved===0),'لا يمكن أرشفة نبات له مخزون أو حجز.');}
    else{D.assert(p.variants.every(v=>v.qty===0&&v.reserved===0),'المنتج الجديد يبدأ بصفر؛ سجل رصيداً افتتاحياً أو مشتريات.');}
    return {writes:{...productWrites([p]),['audit/'+op]:audit(op,'product',p.id)},result:p.id};
  });
}
async function stockChange(input,op=D.id()){
  const path='products/'+input.productId;D.quantity(input.qty);D.integerMoney(input.unitCost);D.integerMoney(input.landed||0);D.dateValue(input.date);D.assert(input.reason?.trim(),'سبب الحركة مطلوب.');
  return store.atomic([path,'audit/'+op],docs=>{if(docs['audit/'+op])return {result:op};const original=docs[path];D.assert(original&&!original.archived,'النبات غير موجود.');let p=structuredClone(original),amount=0;const v=p.variants.find(x=>x.id===input.variantId);D.assert(v,'الصنف غير موجود.');
    if(['purchase','production','opening'].includes(input.kind)){const r=D.receiveStock(p,input.variantId,input.qty,input.unitCost,input.landed||0);p=r.product;amount=r.total;}
    else{D.assert(input.kind==='loss','نوع الحركة غير صالح.');D.assert(D.available(v)>=input.qty,'لا يمكن خصم كمية محجوزة أو غير موجودة.');amount=Math.round(D.stockValue(v)*input.qty/v.qty);v.value=D.stockValue(v)-amount;v.qty-=input.qty;if(v.qty>0)v.cost=Math.round(v.value/v.qty);}
    const movement={id:op,productId:p.id,variantId:input.variantId,kind:input.kind,qty:input.qty,reason:input.reason,date:input.date,by:store.uid(),at:now()};
    const writes={...productWrites([p]),['movements/'+op]:movement,['audit/'+op]:audit(op,'stock',input.reason)};
    if(input.kind==='purchase'){writes['purchases/'+op]={id:op,productId:p.id,variantId:input.variantId,qty:input.qty,unitCost:input.unitCost,landed:input.landed||0,total:amount,supplier:input.reason,date:input.date};writes['cash/'+op]={id:op,direction:'out',category:'purchase',amount,date:input.date,reference:op};}
    if(input.kind==='loss')writes['expenses/'+op]={id:op,amount,date:input.date,description:input.reason,category:'loss',cashPaid:false};
    if(input.kind==='production'&&amount>0){writes['cash/'+op]={id:op,direction:'out',category:'production',amount,date:input.date,reference:op};}
    return {writes,result:op};
  });
}
async function createOrder(input,mode,op=D.id()){
  D.assert(['reserve','sell'].includes(mode),'حالة غير صالحة.');D.assert(input.customer?.trim(),'اسم العميل مطلوب.');input.items=D.normalizeItems(input.items);D.dateValue(input.date);D.integerMoney(input.paid);if(mode==='reserve'){input.expires=input.expires||'';if(input.expires){D.dateValue(input.expires);D.assert(input.expires>=input.date,'انتهاء الحجز قبل تاريخ الطلب.');}D.assert(input.paid===0,'سجّل البيع قبل استلام الدفعات.');}
  const paths=[...new Set(input.items.map(i=>'products/'+i.productId))];const phone=input.customerPhone?phoneNumber(input.customerPhone):'';
  D.assert(input.customer.trim().length<=200,'اسم العميل طويل.');
  const normalizedName=input.customer.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
  let customerId=input.customerId;
  if(!customerId){
   const matches=(await store.list('customers')).filter(c=>phone?c.phone===phone:!c.phone&&c.name.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ')===normalizedName);
   D.assert(matches.length<=1,'يوجد أكثر من عميل مطابق. اختر العميل المسجل من القائمة.');
   if(matches.length)customerId=matches[0].id;
   else if(phone)customerId='phone-'+phone;
   else{const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalizedName));customerId='name-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
  }
  D.assert(/^(phone-[1-9][0-9]{7,14}|name-[a-f0-9]{64})$/.test(customerId),'معرّف العميل غير صالح.');
  return store.atomic([...paths,'orders/'+op,...(customerId?['customers/'+customerId]:[])],docs=>{if(docs['orders/'+op])return {result:op};const savedCustomer=customerId?docs['customers/'+customerId]:null;if(input.customerId)D.assert(savedCustomer,'اختر عميلاً مسجلاً صالحاً.');if(savedCustomer)input={...input,customer:savedCustomer.name,customerPhone:savedCustomer.phone};else input={...input,customerPhone:phone};input.customerId=customerId;const plan=D.planOrder(paths.map(p=>docs[p]),input,mode);D.assert(input.paid<=plan.total,'الدفعة أكبر من إجمالي الطلب.');const order={id:op,number:'TP-'+op.slice(0,8).toUpperCase(),customer:input.customer,customerId:input.customerId||'',customerPhone:input.customerPhone||'',source:input.source||'Instagram',destination:input.destination||'',notes:input.notes||'',date:input.date,expires:mode==='reserve'?input.expires:'',items:plan.items,subtotal:plan.subtotal,cogs:plan.cogs,total:plan.total,shippingCharged:plan.shippingCharged,shippingCost:plan.shippingCost,paid:input.paid,status:mode==='reserve'?'reserved':'sold',fulfillment:'pending',revision:1,createdAt:now()};
    const writes={...productWrites(plan.products),['orders/'+op]:order,['audit/'+op]:audit(op,mode,order.number)};
    if(customerId&&!savedCustomer){const at=now();writes['customers/'+customerId]={id:customerId,name:input.customer,phone,city:input.destination||'',notes:'',marketingConsent:false,consentUpdatedAt:at,revision:1,updatedAt:at};}
    plan.movements.forEach((m,i)=>writes['movements/'+op+'-'+i]={...m,id:op+'-'+i,orderId:op,date:input.date,at:now(),by:store.uid()});
    if(input.paid>0)writes['cash/'+op+'-payment']={id:op+'-payment',direction:'in',category:'payment',amount:input.paid,date:input.date,reference:op};
    if(mode==='sell'&&input.shippingCost>0)writes['cash/'+op+'-shipping']={id:op+'-shipping',direction:'out',category:'shipping',amount:input.shippingCost,date:input.date,reference:op};
    return {writes,result:op};
  });
}
async function discountOrder(order,discounts,op=D.id()){
 return store.atomic(['orders/'+order.id,'audit/'+op],docs=>{
  if(docs['audit/'+op])return {result:order.id};
  const o=docs['orders/'+order.id];D.assert(o&&o.revision===order.revision,'تغير الطلب؛ افتحه مجدداً قبل تعديل الخصم.');
  D.assert(['reserved','sold'].includes(o.status),'لا يمكن تعديل خصم طلب ملغي أو مرتجع.');
  D.assert(!o.pendingReceipt,'راجع إيصال التحويل المعلّق قبل تعديل الخصم.');
  D.assert(Array.isArray(discounts)&&discounts.length===o.items.length,'بنود الخصم لا تطابق الطلب.');
  const before=o.items.map(i=>({price:i.price,originalPrice:i.originalPrice??i.price}));
  o.items=o.items.map((i,n)=>{const originalPrice=D.integerMoney(i.originalPrice??i.price),discount=D.integerMoney(discounts[n]);D.assert(discount<=originalPrice,'الخصم أكبر من سعر القطعة.');return {...i,originalPrice,price:originalPrice-discount};});
  o.subtotal=D.integerMoney(o.items.reduce((s,i)=>s+i.qty*i.price,0));o.total=D.integerMoney(o.subtotal+o.shippingCharged);
  D.assert(o.total>=o.paid,'الإجمالي بعد الخصم أقل من المبلغ المستلم؛ يلزم معالجة الاسترداد أولاً.');
  o.revision++;return {writes:{['orders/'+o.id]:o,['audit/'+op]:audit(op,'order-discount',{orderId:o.id,before,after:o.items.map(i=>({price:i.price,originalPrice:i.originalPrice}))})},result:o.id};
 });
}
async function orderAction(order,kind,extra={},op=D.id()){
  D.assert(['fulfill','cancel','return','payment','shipment'].includes(kind),'عملية غير معروفة.');
  const paths=[...new Set(order.items.map(i=>'products/'+i.productId))],date=D.dateValue(extra.date||D.localDate());
  return store.atomic(['orders/'+order.id,'audit/'+op,...paths],docs=>{if(docs['audit/'+op])return {result:op};const o=docs['orders/'+order.id];D.assert(o&&o.revision===order.revision,'تغير الطلب. حدّث الصفحة وحاول مجدداً.');const writes={};if(kind==='payment')D.assert(!o.pendingReceipt,'يوجد إيصال بانتظار المراجعة؛ أكده أو ارفضه من طلبات الموقع قبل تسجيل دفعة يدوية.');
    // Payment or dispatch converts a reservation into an unpaid sale exactly once.
    if(o.status==='reserved'&&(kind==='payment'||(kind==='shipment'&&['shipped','delivered'].includes(extra.fulfillment)))){
      const plan=D.planOrder(paths.map(p=>docs[p]),o,'fulfill');Object.assign(writes,productWrites(plan.products));o.status='sold';o.date=date;o.items=plan.items;o.cogs=plan.cogs;
      plan.movements.forEach((m,i)=>writes['movements/'+op+'-'+i]={...m,id:op+'-'+i,orderId:o.id,date,at:now(),by:store.uid()});
      if(o.shippingCost>0)writes['cash/'+op+'-shipping']={id:op+'-shipping',amount:o.shippingCost,direction:'out',category:'shipping',date,reference:o.id};
    }
    if(kind==='payment'){D.assert(o.status==='sold','الدفعات للطلبات المباعة فقط.');const amount=D.integerMoney(extra.amount);D.assert(amount>0&&amount<=o.total-o.paid,'المبلغ يتجاوز المتبقي أو غير موجب.');o.paid+=amount;writes['cash/'+op]={id:op,amount,direction:'in',category:'payment',date,reference:o.id};}
    else if(kind==='shipment'){D.assert(['reserved','sold'].includes(o.status),'الطلب غير نشط.');D.assert(['pending','shipped','delivered','issue'].includes(extra.fulfillment),'حالة الشحن غير صالحة.');o.fulfillment=extra.fulfillment;writes['shipments/'+o.id]={id:o.id,orderId:o.id,tracking:extra.tracking||'',carrier:extra.carrier||'',status:extra.fulfillment,date};}
    else{D.assert(kind==='return'?o.status==='sold':o.status==='reserved','لا يمكن تكرار العملية أو تنفيذها بهذه الحالة.');if(kind==='return')D.assert(extra.reason?.trim(),'سبب المرتجع مطلوب.');const plan=D.planOrder(paths.map(p=>docs[p]),{...o,restock:!!extra.restock},kind);Object.assign(writes,productWrites(plan.products));plan.movements.forEach((m,i)=>writes['movements/'+op+'-'+i]={...m,id:op+'-'+i,orderId:o.id,date,at:now(),by:store.uid()});
      if(kind==='fulfill'){o.status='sold';o.date=date;o.items=plan.items;o.cogs=plan.cogs;if(o.shippingCost>0)writes['cash/'+op]={id:op,amount:o.shippingCost,direction:'out',category:'shipping',date,reference:o.id};}
      if(kind==='cancel')o.status='cancelled';
      if(kind==='return'){o.status='returned';o.returnDate=date;o.restock=!!extra.restock;o.returnReason=extra.reason;if(o.paid>0)writes['cash/'+op]={id:op,amount:o.paid,direction:'out',category:'refund',date,reference:o.id};o.refunded=o.paid;}
    }
    o.revision++;writes['orders/'+o.id]=o;writes['audit/'+op]=audit(op,kind,o.id);return {writes,result:op};
  });
}
async function expense(input,op=D.id()){D.assert(input.description?.trim(),'الوصف مطلوب.');D.integerMoney(input.amount);D.assert(input.amount>0,'المبلغ يجب أن يكون موجباً.');D.dateValue(input.date);return store.atomic(['expenses/'+op],docs=>docs['expenses/'+op]?{result:op}:{writes:{['expenses/'+op]:{...input,id:op,cashPaid:true},['cash/'+op]:{id:op,amount:input.amount,direction:'out',category:'expense',date:input.date,reference:op},['audit/'+op]:audit(op,'expense',input.description)},result:op});}
async function supply(input,op=D.id()){
  D.assert(input.name?.trim(),'اسم المستلزم مطلوب.');const amount=D.quantity(input.qty);D.integerMoney(input.cost);D.dateValue(input.date);const pid=input.id||op;
  return store.atomic(['supplies/'+pid,'audit/'+op],docs=>{if(docs['audit/'+op])return {result:pid};const old=docs['supplies/'+pid];const p=old||{id:pid,name:input.name,unit:input.unit||'قطعة',qty:0,cost:input.cost};const writes={};
    if(input.consume){D.assert(old&&p.qty>=amount,'كمية المستلزم غير كافية.');p.qty-=amount;writes['expenses/'+op]={id:op,amount:amount*p.cost,description:'استهلاك '+p.name,category:'supply',date:input.date,cashPaid:false};}
    else{const value=amount*input.cost;p.cost=Math.round((p.qty*p.cost+value)/(p.qty+amount));p.qty+=amount;writes['cash/'+op]={id:op,amount:value,direction:'out',category:'supply-purchase',date:input.date,reference:pid};}
    writes['supplies/'+pid]=p;writes['audit/'+op]=audit(op,input.consume?'supply-use':'supply-purchase',pid);return {writes,result:pid};
  });
}

async function setVariantHidden(product,variantId,hidden,op=D.id()){
 const path='products/'+product.id;
 return store.atomic([path,'audit/'+op],docs=>{
  if(docs['audit/'+op])return {result:product.id};
  const old=docs[path];D.assert(old&&!old.archived,'النبتة غير موجودة.');
  D.assert(old.revision===product.revision,'تغيرت النبتة. أغلق النافذة وأعد فتحها.');
  const p=structuredClone(old),v=p.variants.find(x=>x.id===variantId);D.assert(v,'الصنف غير موجود.');
  if(hidden)D.assert(v.qty===0&&v.reserved===0,'يمكن إخفاء الصنف فقط عندما يكون الموجود والمحجوز صفراً.');
  v.hidden=!!hidden;v.sell=false;
  return {writes:{...productWrites([p]),['audit/'+op]:audit(op,hidden?'variant-hide':'variant-restore',{productId:p.id,variantId})},result:p.id};
 });
}
async function appendOrderItems(order,items,op=D.id()){
 items=D.normalizeItems(items);const paths=[...new Set(items.map(i=>'products/'+i.productId))];
 return store.atomic(['orders/'+order.id,'audit/'+op,...paths],docs=>{
  if(docs['audit/'+op])return {result:order.id};const o=docs['orders/'+order.id];
  D.assert(o&&o.revision===order.revision,'تغير الطلب؛ افتحه مجدداً قبل إضافة البنود.');
  D.assert(['reserved','sold'].includes(o.status),'لا يمكن إضافة بنود لطلب ملغي أو مرتجع.');
  D.assert(!['shipped','delivered'].includes(o.fulfillment),'تم شحن هذا الطلب؛ أنشئ طلباً جديداً للقطع الإضافية.');
  for(const item of items){const previous=o.items.find(x=>x.productId===item.productId&&x.variantId===item.variantId);D.assert(!previous||previous.price===item.price,'الصنف موجود في الطلب بسعر مختلف؛ استخدم سعره السابق لإضافة الكمية.');}
  const plan=D.planOrder(paths.map(p=>docs[p]),{items,shippingCharged:0,shippingCost:0},o.status==='reserved'?'reserve':'sell');
  for(const item of plan.items){const previous=o.items.find(x=>x.productId===item.productId&&x.variantId===item.variantId);if(previous){previous.costValue=(previous.costValue??previous.cost*previous.qty)+(item.costValue??item.cost*item.qty);previous.qty+=item.qty;previous.cost=Math.round(previous.costValue/previous.qty);}else o.items.push(item);}
  D.assert(o.items.length<=20,'الحد الأقصى 20 صنفاً في الطلب.');o.subtotal=o.items.reduce((s,i)=>s+i.qty*i.price,0);o.total=o.subtotal+o.shippingCharged;o.cogs=o.items.reduce((s,i)=>s+(i.costValue??i.cost*i.qty),0);D.integerMoney(o.total);o.revision++;
  const writes={...productWrites(plan.products),['orders/'+o.id]:o,['audit/'+op]:audit(op,'order-items-add',o.number)};
  plan.movements.forEach((m,i)=>writes['movements/'+op+'-'+i]={...m,id:op+'-'+i,orderId:o.id,date:o.date,at:now(),by:store.uid()});return {writes,result:o.id};
 });
}

// Append-only correction: preserve the original receipt and payment; never change quantities.
async function correctPurchaseCost(input,op=D.id()){
 D.integerMoney(input.unitCost);D.integerMoney(input.landed);D.assert(input.reason?.trim(),'اكتب سبب تصحيح التكلفة.');
 const p=await store.get('products/'+input.productId);D.assert(p&&p.revision===input.productRevision,'تغيرت النبتة. أعد فتح التصحيح.');
 const [movements,orders,audits]=await Promise.all([store.list('movements'),store.list('orders'),store.list('audit')]);
 D.assert(!movements.some(m=>m.productId===p.id&&m.variantId===input.variantId&&!['purchase','opening','production','reserve','cancel','cost-correction'].includes(m.kind))&&!orders.some(o=>['sold','returned'].includes(o.status)&&o.items.some(i=>i.productId===p.id&&i.variantId===input.variantId)),'سبق بيع أو إتلاف كمية من هذا الصنف. تصحيحها يحتاج إعادة احتساب تكلفة المباع، وهو غير متاح في هذا الإجراء.');
 const path='purchases/'+input.purchaseId;
 return store.atomic([path,'products/'+p.id,'audit/'+op],docs=>{
 if(docs['audit/'+op])return {result:p.id};const original=docs[path],product=structuredClone(docs['products/'+p.id]);
 D.assert(original&&original.productId===p.id&&original.variantId===input.variantId,'عملية الشراء غير موجودة.');D.assert(product.revision===input.productRevision,'تغيرت البيانات. أعد فتح التصحيح.');
 const old=effectivePurchase(original,audits);D.assert(old.correctionVersion===input.correctionVersion,'تم تصحيح العملية سابقاً. أعد فتحها.');
 const total=original.qty*input.unitCost+input.landed;D.integerMoney(total);const delta=total-old.total;D.assert(delta!==0,'لم تتغير التكلفة الإجمالية.');
 const v=product.variants.find(v=>v.id===original.variantId);D.assert(v&&v.qty>0,'لا توجد كمية لتحديث تكلفتها.');const value=D.stockValue(v)+delta;D.integerMoney(value);v.value=value;v.cost=Math.round(value/v.qty);
 const record={...audit(op,'purchase-cost-correction',input.reason.trim()),purchaseId:original.id,productId:p.id,variantId:v.id,unitCost:input.unitCost,landed:input.landed,total,previousTotal:old.total,delta,correctionVersion:old.correctionVersion+1};
 const writes={...productWrites([product]),['audit/'+op]:record,['movements/'+op]:{id:op,productId:p.id,variantId:v.id,kind:'cost-correction',qty:0,reason:input.reason.trim(),date:D.localDate(),at:now(),by:store.uid()},['cash/'+op]:{id:op,direction:delta>0?'out':'in',category:'purchase-correction',amount:Math.abs(delta),date:original.date,reference:original.id}};
 return {writes,result:p.id};
 });
}

async function correctOpeningCost(input,op=D.id()){
 D.integerMoney(input.unitCost);D.assert(input.reason?.trim(),'اكتب سبب تحديد التكلفة.');
 const initial=await store.get('products/'+input.productId);D.assert(initial&&initial.revision===input.productRevision,'تغيرت النبتة. أعد فتح النموذج.');
 const [purchases,movements]=await Promise.all([store.list('purchases'),store.list('movements')]);
 D.assert(!purchases.some(x=>x.productId===input.productId&&x.variantId===input.variantId)&&!movements.some(x=>x.productId===input.productId&&x.variantId===input.variantId&&['purchase','production'].includes(x.kind)),'هذا الصنف له شراء أو إنتاج مسجل. استخدم إجراء التكلفة الخاص بالعملية.');
 return store.atomic(['products/'+input.productId,'audit/'+op],docs=>{
 if(docs['audit/'+op])return {result:input.productId};const p=structuredClone(docs['products/'+input.productId]);D.assert(p&&!p.archived&&p.revision===input.productRevision,'تغيرت النبتة. أعد فتح النموذج.');const v=p.variants.find(v=>v.id===input.variantId);D.assert(v&&v.qty>0,'لا توجد كمية متبقية لتحديد تكلفتها.');
 const before=D.stockValue(v),after=v.qty*input.unitCost;D.integerMoney(after);D.assert(after!==before,'لم تتغير التكلفة.');v.value=after;v.cost=input.unitCost;
 const record={...audit(op,'opening-cost-correction',input.reason.trim()),productId:p.id,variantId:v.id,qty:v.qty,previousValue:before,value:after,unitCost:input.unitCost};
 return {writes:{...productWrites([p]),['audit/'+op]:record,['movements/'+op]:{id:op,productId:p.id,variantId:v.id,kind:'opening-cost-correction',qty:0,reason:input.reason.trim()+' · قيمة المخزون: '+D.formatMoney(before)+' ← '+D.formatMoney(after),date:D.localDate(),at:now(),by:store.uid()}},result:p.id};
 });
}

async function saveCustomer(input,op=D.id()){
 const phone=input.phone?phoneNumber(input.phone):'',id=input.id||(phone?'phone-'+phone:'');
 D.assert(/^(phone-[1-9][0-9]{7,14}|name-[a-f0-9]{64})$/.test(id),'معرّف العميل غير صالح.');
 D.assert(!id.startsWith('phone-')||id==='phone-'+phone,'لا يمكن تغيير رقم العميل المرتبط.');
 D.assert(input.name?.trim(),'اسم العميل مطلوب.');D.assert(input.name.length<=200,'اسم العميل طويل.');
 return store.atomic(['customers/'+id,'audit/'+op],docs=>{if(docs['audit/'+op])return {result:id};const old=docs['customers/'+id];D.assert(!input.id||old,'العميل غير موجود.');D.assert(!id.startsWith('name-')||phone===(old?.phone||''),'إضافة رقم لهذا الملف تتطلب ربطاً مستقلاً.');D.assert((old?.revision||0)===(input.revision||0),'العميل موجود أو تغيرت بياناته. افتح سجله من قائمة العملاء.');const at=new Date().toISOString();return {writes:{['customers/'+id]:{id,name:input.name.trim(),phone,city:input.city||'',notes:input.notes||'',marketingConsent:!!input.marketingConsent,consentUpdatedAt:old?.marketingConsent===!!input.marketingConsent?old.consentUpdatedAt:at,revision:(old?.revision||0)+1,updatedAt:at},['audit/'+op]:{id:op,kind:'customer',by:store.uid(),at,details:id}},result:id};});
}


async function linkOrderCustomer(input,op=D.id()){
 D.assert(Array.isArray(input.orders)&&input.orders.length>0&&input.orders.length<=100,'اختر الطلبات المراد ربطها.');
 const name=String(input.name||'').trim(),norm=v=>String(v||'').trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 D.assert(name&&name.length<=200,'اسم العميل غير صالح.');
 const orders=input.orders;D.assert(new Set(orders.map(o=>o.id)).size===orders.length,'طلب مكرر.');
 orders.forEach(o=>D.assert(/^[\w.-]{1,180}$/.test(o.id)&&Number.isInteger(o.revision),'معرف الطلب غير صالح.'));
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(norm(name)));
 const id='name-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 const candidates=(await store.list('customers')).filter(c=>norm(c.name)===norm(name));
 D.assert(candidates.length<=1,'يوجد أكثر من ملف مطابق؛ يلزم مراجعة الربط.');
 const customerId=candidates[0]?.id||id,cp='customers/'+customerId;
 return store.atomic([cp,'audit/'+op,...orders.map(o=>'orders/'+o.id)],docs=>{
  if(docs['audit/'+op])return {result:customerId};
  const writes={},at=now();
  for(const expected of orders){const path='orders/'+expected.id,o=docs[path];
   D.assert(o&&o.revision===expected.revision,'تغير الطلب؛ حدّث الصفحة.');
   D.assert(norm(o.customer)===norm(name),'اسم العميل لا يطابق الطلب.');
   D.assert(!o.customerId,'الطلب مرتبط بعميل بالفعل.');
   D.assert(!o.customerPhone,'الطلب يحتوي رقم جوال؛ يلزم ربطه بملف الرقم.');
   writes[path]={...o,customerId,revision:o.revision+1};
  }
  if(!docs[cp])writes[cp]={id:customerId,name,phone:'',city:'',notes:'',marketingConsent:false,consentUpdatedAt:at,revision:1,updatedAt:at};
  writes['audit/'+op]=audit(op,'link-order-customer',{customerId,orderIds:orders.map(o=>o.id)});
  return {writes,result:customerId};
 });
}

return {linkOrderCustomer,receivePlant,saveProduct,stockChange,createOrder,discountOrder,orderAction,expense,supply,setVariantHidden,appendOrderItems,correctPurchaseCost,correctOpeningCost,saveCustomer};
}
