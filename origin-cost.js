import {assert,integerMoney,formatMoney} from './domain.js';
import {effectivePurchase} from './purchase-cost.js';

// Reporting only: never allocates the mother's historical cost to its offspring.
export function costReview({products=[],purchases=[],movements=[],audit=[]}){
 const result={missing:[],legacy:[],production:[],knownZero:[],gifts:[]};
 for(const p of products.filter(p=>!p.archived)){
  const origin=p.originPurchase;
  const gift=origin?.status==='gift';
  const recorded=origin?.status==='purchased'&&origin.amount>0;
  const receipts=purchases.filter(r=>r.productId===p.id).map(r=>effectivePurchase(r,audit));
  const legacy=receipts.some(r=>r.total>0)||(p.variants||[]).some(v=>v.cost>0);
  if(gift)result.gifts.push(p);
  else if(!recorded)(legacy?result.legacy:result.missing).push(p);
  for(const v of (p.variants||[]).filter(v=>v.qty>0&&v.cost===0)){
   if(gift)continue;
   const history=movements.filter(m=>m.productId===p.id&&m.variantId===v.id);
   const produced=history.some(m=>m.kind==='production');
   const purchased=receipts.some(r=>r.variantId===v.id)||history.some(m=>m.kind==='purchase');
   // A production event alone does not prove mixed purchased stock is production.
   if(produced&&!purchased)result.production.push({p,v});
   else if(recorded||legacy)result.knownZero.push({p,v});
  }
 }
 return result;
}
export function validateOrigin(o){
 if(o===undefined)return;
 assert(o&&typeof o==='object'&&!Array.isArray(o),'سجل الأصل غير صالح.');
 assert(Object.keys(o).every(k=>['status','form','amount','notes'].includes(k)),'حقول سجل الأصل غير صالحة.');
 assert(['purchased','gift','unknown'].includes(o.status),'حدد حالة شراء الأصل.');
 assert(['','كورمة','مذر','كتنج','شتلة','شتلة صغيرة','نبتة'].includes(o.form),'صنف الأصل غير صالح.');
 assert(typeof o.notes==='string'&&o.notes.length<=1000,'ملاحظات الأصل طويلة.');
 if(o.status==='purchased'){integerMoney(o.amount);assert(o.amount>0&&o.form,'أدخل سعر الأصل وصنفه وقت الشراء.');}
 else assert(o.amount===(o.status==='gift'?0:null),'الهدية صفر والتكلفة المجهولة فارغة.');
}
export function originLabel(p){const o=p.originPurchase;return !o||o.status==='unknown'?'غير محدد':o.status==='gift'?'هدية':formatMoney(o.amount);}
