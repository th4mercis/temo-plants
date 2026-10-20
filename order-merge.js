import * as D from './domain.js';
export function mergeEligibility(a,b,shipments=[]){
 if(!a||!b||a.id===b.id)return 'اختر طلبين مختلفين.';
 if(!a.customerId||a.customerId!==b.customerId)return 'يجب ربط الطلبين بملف العميل نفسه؛ تطابق الاسم وحده لا يكفي.';
 if(!['sold','reserved'].includes(a.status)||a.status!==b.status)return 'ادمج مبيعات مع مبيعات أو حجوزات مع حجوزات؛ وحّد الحالة أولاً.';
 if([a,b].some(o=>o.fulfillment!=='pending'))return 'الدمج متاح للطلبات قيد التجهيز فقط.';
 if([a,b].some(o=>o.pendingReceipt))return 'راجع إيصال الدفع المعلّق قبل الدمج.';
 if([a,b].some(o=>D.orderSource(o)==='website'))return 'دمج طلبات الموقع ذات روابط المتابعة غير متاح في هذه النسخة.';
 if(shipments.some(s=>s&&(s.tracking||s.shipmentId||s.status&&s.status!=='pending')))return 'يوجد تتبع أو شحنة مرتبطة؛ راجعها قبل الدمج.';
 return '';
}
export function planMergeOrders(target,source,shipments=[]){
 D.assert(!mergeEligibility(target,source,shipments),mergeEligibility(target,source,shipments));
 const a=structuredClone(target),b=structuredClone(source);
 for(const o of [a,b]){D.normalizeItems(o.items);for(const k of ['total','subtotal','paid','cogs','shippingCharged','shippingCost'])D.integerMoney(o[k]);D.assert(o.total===o.subtotal+o.shippingCharged&&o.paid<=o.total,'مبالغ الطلب غير متسقة.');D.assert(o.subtotal===o.items.reduce((s,i)=>s+i.qty*i.price,0),'إجمالي البنود غير متسق.');}
 if(a.status==='reserved')D.assert(a.paid===0&&b.paid===0,'الحجز يحتوي دفعة؛ راجع حالته أولاً.');
 const parts=o=>o.status==='sold'?[...(o.mergeAccounting||[]),{date:o.date,total:o.total-(o.mergeAccounting||[]).reduce((s,x)=>s+x.total,0),cogs:o.cogs-(o.mergeAccounting||[]).reduce((s,x)=>s+x.cogs,0),shippingCost:o.shippingCost-(o.mergeAccounting||[]).reduce((s,x)=>s+x.shippingCost,0)}]:[];
 const carried=parts(b);
 for(const item of b.items){
  const old=a.items.find(i=>i.productId===item.productId&&i.variantId===item.variantId);
  if(old){D.assert(old.price===item.price&&(old.originalPrice??old.price)===(item.originalPrice??item.price),'الصنف مكرر بسعر أو خصم مختلف؛ راجع التسعير قبل الدمج.');old.costValue=(old.costValue??old.cost*old.qty)+(item.costValue??item.cost*item.qty);old.qty+=item.qty;old.cost=Math.round(old.costValue/old.qty);}
  else a.items.push(item);
 }
 D.assert(a.items.length<=20,'يتجاوز الدمج حد 20 صنفاً.');
 for(const key of ['subtotal','total','paid','cogs','shippingCharged','shippingCost']){a[key]+=b[key];D.integerMoney(a[key]);}
 if(a.status==='sold')a.mergeAccounting=[...(a.mergeAccounting||[]),...carried];
 if(a.status==='reserved')a.expires=[a.expires,b.expires].filter(Boolean).sort()[0]||'';
 a.mergedFrom=[...(a.mergedFrom||[]),{id:b.id,number:b.number}];
 a.revision++;b.revision++;b.status='merged';b.mergedInto=a.id;b.mergedIntoNumber=a.number;
 return {target:a,source:b};
}
