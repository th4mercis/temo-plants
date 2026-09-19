import * as D from './domain.js';
import * as store from './store.js';
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_.-]{1,180}$/.test(s);
const oldId=(kind,id,index)=>'old-'+kind+'-'+String(id??index).replace(/[^A-Za-z0-9_.-]/g,'_');
const txt=(s,n=4000)=>String(s??'').slice(0,n);
const legacyMoney=n=>D.money(String(n??0));
export function previewLegacy(data){
  D.assert(data&&Array.isArray(data.plants),'الملف لا يحتوي قائمة نباتات صالحة.');
  const warnings=[],products=[],archive=[],seen=new Set();
  data.plants.forEach((p,i)=>{const pid=oldId('plant',p.id,i);D.assert(!seen.has(pid),'معرّفات نباتات مكررة في النسخة؛ أصلحها قبل النقل.');seen.add(pid);let reserved=false;
    const variants=(p.variants||[]).map((v,j)=>{const q=Number(v.qty);D.assert(Number.isSafeInteger(q)&&q>=0,'كمية غير صالحة: '+p.name+' — '+v.type);if(v.sell==='reserved')reserved=true;return {id:'v-'+j,type:txt(v.type,100)||'صنف',qty:q,reserved:0,cost:legacyMoney(v.cost),price:legacyMoney(v.price),sell:v.sell==='forsale'};});
    const product={id:pid,name:txt(p.name,200),code:txt(p.code,100)||pid,genus:txt(p.genus,100)||'أخرى',variants,internalNotes:txt(p.notes),publicDescription:'',care:'',size:'',photoDate:'',actualPhoto:false,image:D.safeImage(p.img),supplier:txt(p.src,500),published:false,archived:false,revision:1,updatedAt:new Date().toISOString()};D.validateProduct(product);products.push(product);
    if(reserved)warnings.push('راجع الحجز القديم للنبتة '+product.name+'؛ لم يُنشأ حجز عميل تلقائياً.');
  });
  if(data.plants.some(p=>String(p.img||'').startsWith('data:')))warnings.push('توجد صور مضمّنة؛ ستبقى في النسخة الأصلية، وتحتاج إعادة رفعها إلى Storage.');
  for(const kind of ['plants','sales','expenses','shipments','purchases','orders','supplies']){
    const arr=data[kind]||[];D.assert(Array.isArray(arr),'قسم غير صالح: '+kind);
    arr.forEach((record,i)=>{const copy=structuredClone(record);if(kind==='plants'&&String(copy.img||'').startsWith('data:'))copy.img='[embedded image retained in original backup]';const entry={id:oldId(kind,record.id,i),kind,record:copy,migratedAt:new Date().toISOString()};D.assert(new TextEncoder().encode(JSON.stringify(entry)).length<800000,'سجل قديم كبير جداً للنقل: '+kind);archive.push(entry);});
  }
  D.assert(new Set(archive.map(x=>x.id)).size===archive.length,'توجد معرّفات تاريخية مكررة.');
  return {products,archive,warnings};
}
export async function importLegacy(preview){
  const entries=[...preview.products.map(p=>['products/'+p.id,p]),...preview.archive.map(r=>['legacy/'+r.id,r])];
  D.assert(entries.length<=350,'النقل التلقائي يدعم 350 سجلاً في العملية. احتفظ بالنسخة لعملية نقل موسعة؛ لا تقسّم المخزون يدوياً.');
  D.assert((await store.list('products')).length===0&&(await store.list('legacy')).length===0,'تم نقل بيانات سابقاً. منعاً للتكرار، النقل متاح إلى أقسام فارغة فقط.');
  const marker='audit/legacy-import';return store.atomic([...entries.map(([p])=>p),marker],docs=>{D.assert(!docs[marker],'تم النقل سابقاً.');for(const [p]of entries)D.assert(!docs[p],'السجل موجود بالفعل: '+p);const writes=Object.fromEntries(entries);writes[marker]={id:'legacy-import',kind:'migration',by:store.uid(),at:new Date().toISOString(),details:'legacy archived; opening inventory; unpublished'};return {writes,result:true};});
}
export async function restoreBackup(backup){
  D.assert(backup.schemaVersion===2&&backup.data,'إصدار النسخة غير مدعوم.');const entries=[];
  for(const [c,rows]of Object.entries(backup.data)){D.assert(store.collections.includes(c)&&Array.isArray(rows),'قسم غير صالح: '+c);for(const row of rows){D.assert(row&&safeId(row.id),'معرّف غير صالح في '+c);D.assert(new TextEncoder().encode(JSON.stringify(row)).length<800000,'سجل كبير جداً.');if(c==='products')D.validateProduct(row);}}
  const products=backup.data.products||[],orders=backup.data.orders||[],reserved=new Map();
  for(const o of orders){D.assert(typeof o.customer==='string'&&typeof o.number==='string'&&typeof o.createdAt==='string','بيانات طلب ناقصة.');D.dateValue(o.date);D.assert(['reserved','sold','cancelled','returned'].includes(o.status),'حالة طلب غير صالحة.');D.assert(Number.isSafeInteger(o.revision)&&o.revision>0,'إصدار الطلب غير صالح.');for(const k of ['total','paid','subtotal','cogs','shippingCost','shippingCharged'])D.integerMoney(o[k]);D.assert(o.paid<=o.total&&o.total===o.subtotal+o.shippingCharged,'مبالغ الطلب غير متسقة.');D.normalizeItems(o.items);let subtotal=0,cogs=0;for(const it of o.items){const p=products.find(p=>p.id===it.productId),v=p?.variants.find(v=>v.id===it.variantId);D.assert(v,'طلب مرتبط بنبات أو صنف مفقود.');D.integerMoney(it.cost);D.integerMoney(it.costValue??it.cost*it.qty);subtotal+=it.qty*it.price;cogs+=it.costValue??it.cost*it.qty;if(o.status==='reserved'){const key=p.id+'/'+v.id;reserved.set(key,(reserved.get(key)||0)+it.qty);}}D.assert(subtotal===o.subtotal&&cogs===o.cogs,'مجموع بنود الطلب لا يطابق الإجمالي.');if(o.status==='returned')D.dateValue(o.returnDate);}
  for(const p of products){for(const v of p.variants)D.assert(v.reserved===(reserved.get(p.id+'/'+v.id)||0),'كمية الحجز لا تطابق الطلبات.');}
  for(const c of ['cash','expenses'])for(const r of backup.data[c]||[]){D.integerMoney(r.amount);D.dateValue(r.date);if(c==='cash')D.assert(['in','out'].includes(r.direction),'اتجاه حركة نقدية غير صالح.');}
  for(const s of backup.data.supplies||[]){D.assert(typeof s.name==='string'&&Number.isSafeInteger(s.qty)&&s.qty>=0,'مستلزم غير صالح.');D.integerMoney(s.cost);}
  // Build without mutating the caller's backup. Every product is restored as a draft.
  for(const c of store.collections){for(const source of backup.data[c]||[]){const row=structuredClone(source);if(c==='products'){row.published=false;row.updatedAt=new Date().toISOString();}entries.push([c+'/'+row.id,row]);}}
  D.assert(entries.length<=350,'الاستعادة التلقائية تدعم حتى 350 سجلاً. تحتاج النسخة الأكبر استعادة مخصصة.');D.assert(new Set(entries.map(([p])=>p)).size===entries.length,'معرّفات مكررة في النسخة.');
  for(const c of store.collections)D.assert((await store.list(c)).length===0,'الاستعادة متاحة إلى قاعدة الإصدار الجديد الفارغة فقط. القسم يحتوي سجلات: '+c);
  return store.atomic(entries.map(([p])=>p),docs=>{for(const [p]of entries)D.assert(!docs[p],'سجل موجود مسبقاً.');return {writes:Object.fromEntries(entries),result:true};});
}
