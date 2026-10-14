import {available,variantHidden,formatMoney} from './domain.js';
// Presentation only. Never infer a sale, or publish/change inventory from a label.
export function variantState(p,v){
 if(!v.sell)return 'collection';
 if(available(v)<=0)return v.reserved>0?'reserved':'empty';
 if(p.published)return 'live';
 return v.price>0?'draft':'unpriced';
}
export const variantStates={collection:'هذا الصنف غير مخصص للبيع',live:'معروض في المتجر',draft:'مسودة بيع — غير منشور',unpriced:'غير منشور — سعر البيع غير محدد',reserved:'محجوز بالكامل',empty:'لا يوجد مخزون متاح'};
export function salePriceLabel(v){return !v.sell?'غير مطروح للبيع':v.price>0?'سعر بيع القطعة: '+formatMoney(v.price):'سعر البيع غير محدد';}
export function inventoryEntries(products){return products.filter(p=>!p.archived).flatMap(p=>p.variants.filter(v=>!variantHidden(v)).map(v=>({p,v,status:variantState(p,v)})));}
export function saleEntries(products){return products.filter(p=>!p.archived).flatMap(p=>p.variants.filter(v=>v.sell&&!variantHidden(v)).map(v=>({p,v,status:available(v)<=0?'empty':p.published?'live':'draft'})));}
