import {assert,integerMoney,formatMoney} from './domain.js';
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
