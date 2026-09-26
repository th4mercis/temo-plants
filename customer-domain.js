export function phoneNumber(raw){
 let p=String(raw||'').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[\s()+-]/g,'');
 if(p.startsWith('00'))p=p.slice(2);if(/^05\d{8}$/.test(p))p='966'+p.slice(1);
 if(!/^[1-9]\d{7,14}$/.test(p))throw new Error('أدخل رقم الجوال مع رمز الدولة، مثل 9665XXXXXXXX أو 05XXXXXXXX.');return p;
}
export function invoiceMessage(o,format){return ['Temo_plants', 'فاتورة / بيان بيع: '+o.number,'التاريخ: '+o.date,'الحالة: '+({sold:'مباع',reserved:'محجوز',cancelled:'ملغي',returned:'مرتجع'}[o.status]||o.status),'العميل: '+o.customer,...o.items.map(i=>i.name+' — '+i.type+' × '+i.qty+' = '+format(i.qty*i.price)),'قيمة النباتات: '+format(o.subtotal),'الشحن: '+format(o.shippingCharged),'الإجمالي: '+format(o.total),'المستلم: '+format(o.paid),o.status==='returned'?'المسترد: '+format(o.refunded||0):'المتبقي: '+format(o.total-o.paid),'شكراً لاختيارك Temo Plants 🌿'].join('\n');}
