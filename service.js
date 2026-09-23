import * as D from './domain.js';
import * as store from './store.js';
const now=()=>new Date().toISOString();
// One transaction for the plant, stock, purchase and payment: retries cannot duplicate them.
export async function receivePlant(input,receipt,op=D.id()){
  D.validateProduct(input);D.quantity(receipt.qty);D.integerMoney(receipt.unitCost);D.integerMoney(receipt.landed||0);D.dateValue(receipt.date);
  D.assert(['purchase','opening','production'].includes(receipt.kind),'نوع الإضافة غير صالح.');
  const path='products/'+input.id;
  return store.atomic([path,'audit/'+op],docs=>{
    if(docs['audit/'+op])return {result:input.id};
    const old=docs[path];let p;
    if(receipt.kind==='production'){
      D.assert(old&&!old.archived,'النبتة غير موجودة.');D.assert(old.revision===input.revision,'تغيرت النبتة. أعد فتح إضافة الإنتاج.');p=structuredClone(old);
      let v=p.variants.find(v=>v.id===receipt.variantId);
      if(!v){D.assert(receipt.type?.trim(),'اسم الصنف مطلوب.');D.assert(!p.variants.some(v=>v.type.trim()===receipt.type.trim()),'الصنف موجود؛ اختره من القائمة.');v={id:receipt.variantId,type:receipt.type.trim(),qty:0,reserved:0,cost:0,price:0,sell:false};p.variants.push(v);}
      D.integerMoney(receipt.price);v.price=receipt.price;v.sell=!!receipt.sell;
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
export async function saveProduct(input,op=D.id()){
  D.validateProduct(input);const path='products/'+input.id;
  return store.atomic([path,'audit/'+op],docs=>{if(docs['audit/'+op])return {result:input.id};const old=docs[path];D.assert(!old||old.revision===input.revision,'تغيرت النبتة على جهاز آخر. أغلق النموذج وأعد فتحه.');const p=structuredClone(input);
    if(old){D.assert(old.variants.every(v=>p.variants.some(x=>x.id===v.id)),'لا يمكن إزالة صنف له تاريخ؛ أوقف عرضه بدلاً من حذفه.');p.code=old.code;p.variants.forEach(v=>{const prev=old.variants.find(x=>x.id===v.id);if(prev){v.qty=prev.qty;v.reserved=prev.reserved;v.cost=prev.cost;v.value=D.stockValue(prev);}else{D.assert(v.qty===0&&v.reserved===0&&v.cost===0,'الصنف الجديد يبدأ برصيد صفر.');v.value=0;}});if(p.archived)D.assert(p.variants.every(v=>v.qty===0&&v.reserved===0),'لا يمكن أرشفة نبات له مخزون أو حجز.');}
    else{D.assert(p.variants.every(v=>v.qty===0&&v.reserved===0),'المنتج الجديد يبدأ بصفر؛ سجل رصيداً افتتاحياً أو مشتريات.');}
    return {writes:{...productWrites([p]),['audit/'+op]:audit(op,'product',p.id)},result:p.id};
  });
}
export async function stockChange(input,op=D.id()){
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
export async function createOrder(input,mode,op=D.id()){
  D.assert(['reserve','sell'].includes(mode),'حالة غير صالحة.');D.assert(input.customer?.trim(),'اسم العميل مطلوب.');input.items=D.normalizeItems(input.items);D.dateValue(input.date);D.integerMoney(input.paid);if(mode==='reserve'){D.dateValue(input.expires);D.assert(input.expires>=input.date,'انتهاء الحجز قبل تاريخ الطلب.');D.assert(input.paid===0,'سجّل البيع قبل استلام الدفعات.');}
  const paths=[...new Set(input.items.map(i=>'products/'+i.productId))];
  return store.atomic([...paths,'orders/'+op],docs=>{if(docs['orders/'+op])return {result:op};const plan=D.planOrder(paths.map(p=>docs[p]),input,mode);D.assert(input.paid<=plan.total,'الدفعة أكبر من إجمالي الطلب.');const order={id:op,number:'TP-'+op.slice(0,8).toUpperCase(),customer:input.customer,source:input.source||'Instagram',destination:input.destination||'',notes:input.notes||'',date:input.date,expires:mode==='reserve'?input.expires:'',items:plan.items,subtotal:plan.subtotal,cogs:plan.cogs,total:plan.total,shippingCharged:plan.shippingCharged,shippingCost:plan.shippingCost,paid:input.paid,status:mode==='reserve'?'reserved':'sold',fulfillment:'pending',revision:1,createdAt:now()};
    const writes={...productWrites(plan.products),['orders/'+op]:order,['audit/'+op]:audit(op,mode,order.number)};
    plan.movements.forEach((m,i)=>writes['movements/'+op+'-'+i]={...m,id:op+'-'+i,orderId:op,date:input.date,at:now(),by:store.uid()});
    if(input.paid>0)writes['cash/'+op+'-payment']={id:op+'-payment',direction:'in',category:'payment',amount:input.paid,date:input.date,reference:op};
    if(mode==='sell'&&input.shippingCost>0)writes['cash/'+op+'-shipping']={id:op+'-shipping',direction:'out',category:'shipping',amount:input.shippingCost,date:input.date,reference:op};
    return {writes,result:op};
  });
}
export async function orderAction(order,kind,extra={},op=D.id()){
  D.assert(['fulfill','cancel','return','payment','shipment'].includes(kind),'عملية غير معروفة.');
  const paths=[...new Set(order.items.map(i=>'products/'+i.productId))],date=D.dateValue(extra.date||D.localDate());
  return store.atomic(['orders/'+order.id,'audit/'+op,...paths],docs=>{if(docs['audit/'+op])return {result:op};const o=docs['orders/'+order.id];D.assert(o&&o.revision===order.revision,'تغير الطلب. حدّث الصفحة وحاول مجدداً.');const writes={};
    if(kind==='payment'){D.assert(o.status==='sold','الدفعات للطلبات المباعة فقط.');const amount=D.integerMoney(extra.amount);D.assert(amount>0&&amount<=o.total-o.paid,'المبلغ يتجاوز المتبقي أو غير موجب.');o.paid+=amount;writes['cash/'+op]={id:op,amount,direction:'in',category:'payment',date,reference:o.id};}
    else if(kind==='shipment'){D.assert(o.status==='sold','الطلب غير مباع.');D.assert(['pending','shipped','delivered','issue'].includes(extra.fulfillment),'حالة الشحن غير صالحة.');o.fulfillment=extra.fulfillment;writes['shipments/'+o.id]={id:o.id,orderId:o.id,tracking:extra.tracking||'',carrier:extra.carrier||'',status:extra.fulfillment,date};}
    else{D.assert(kind==='return'?o.status==='sold':o.status==='reserved','لا يمكن تكرار العملية أو تنفيذها بهذه الحالة.');if(kind==='return')D.assert(extra.reason?.trim(),'سبب المرتجع مطلوب.');const plan=D.planOrder(paths.map(p=>docs[p]),{...o,restock:!!extra.restock},kind);Object.assign(writes,productWrites(plan.products));plan.movements.forEach((m,i)=>writes['movements/'+op+'-'+i]={...m,id:op+'-'+i,orderId:o.id,date,at:now(),by:store.uid()});
      if(kind==='fulfill'){o.status='sold';o.date=date;o.items=plan.items;o.cogs=plan.cogs;if(o.shippingCost>0)writes['cash/'+op]={id:op,amount:o.shippingCost,direction:'out',category:'shipping',date,reference:o.id};}
      if(kind==='cancel')o.status='cancelled';
      if(kind==='return'){o.status='returned';o.returnDate=date;o.restock=!!extra.restock;o.returnReason=extra.reason;if(o.paid>0)writes['cash/'+op]={id:op,amount:o.paid,direction:'out',category:'refund',date,reference:o.id};o.refunded=o.paid;}
    }
    o.revision++;writes['orders/'+o.id]=o;writes['audit/'+op]=audit(op,kind,o.id);return {writes,result:op};
  });
}
export async function expense(input,op=D.id()){D.assert(input.description?.trim(),'الوصف مطلوب.');D.integerMoney(input.amount);D.assert(input.amount>0,'المبلغ يجب أن يكون موجباً.');D.dateValue(input.date);return store.atomic(['expenses/'+op],docs=>docs['expenses/'+op]?{result:op}:{writes:{['expenses/'+op]:{...input,id:op,cashPaid:true},['cash/'+op]:{id:op,amount:input.amount,direction:'out',category:'expense',date:input.date,reference:op},['audit/'+op]:audit(op,'expense',input.description)},result:op});}
export async function supply(input,op=D.id()){
  D.assert(input.name?.trim(),'اسم المستلزم مطلوب.');const amount=D.quantity(input.qty);D.integerMoney(input.cost);D.dateValue(input.date);const pid=input.id||op;
  return store.atomic(['supplies/'+pid,'audit/'+op],docs=>{if(docs['audit/'+op])return {result:pid};const old=docs['supplies/'+pid];const p=old||{id:pid,name:input.name,unit:input.unit||'قطعة',qty:0,cost:input.cost};const writes={};
    if(input.consume){D.assert(old&&p.qty>=amount,'كمية المستلزم غير كافية.');p.qty-=amount;writes['expenses/'+op]={id:op,amount:amount*p.cost,description:'استهلاك '+p.name,category:'supply',date:input.date,cashPaid:false};}
    else{const value=amount*input.cost;p.cost=Math.round((p.qty*p.cost+value)/(p.qty+amount));p.qty+=amount;writes['cash/'+op]={id:op,amount:value,direction:'out',category:'supply-purchase',date:input.date,reference:pid};}
    writes['supplies/'+pid]=p;writes['audit/'+op]=audit(op,input.consume?'supply-use':'supply-purchase',pid);return {writes,result:pid};
  });
}
