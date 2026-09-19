export const SCHEMA = 2;
export const id = () => crypto.randomUUID();
export function assert(ok,message){if(!ok)throw new Error(message);}
export function quantity(value){const n=Number(value);assert(value!==''&&Number.isSafeInteger(n)&&n>0&&n<=100000,'أدخل كمية صحيحة موجبة (حتى 100000).');return n;}
export function money(value){assert(value!==''&&value!==null&&value!==undefined,'أدخل المبلغ.');const n=Number(value);assert(Number.isFinite(n)&&n>=0&&n<=10000000,'المبلغ غير صالح.');assert(Math.abs(n*100-Math.round(n*100))<.000001,'المبلغ يقبل منزلتين عشريتين فقط.');return Math.round(n*100);}
export function integerMoney(n){assert(Number.isSafeInteger(n)&&n>=0&&n<=1000000000,'قيمة مالية غير صالحة.');return n;}
export const formatMoney = n => new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',minimumFractionDigits:2}).format(n/100);
export function localDate(date=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
export function dateValue(s){assert(/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s,'التاريخ غير صالح.');return s;}
export const available=v=>v.qty-v.reserved;
export const stockValue=v=>v.value??v.cost*v.qty;
export function validateProduct(p){
  assert(typeof p.id==='string'&&p.id.length>0,'معرّف المنتج غير صالح.');
  assert(typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=200,'اسم النبات مطلوب (حتى 200 حرف).');
  assert(Array.isArray(p.variants)&&p.variants.length>0&&p.variants.length<=30,'يلزم صنف واحد إلى 30 صنفاً.');
  assert(new Set(p.variants.map(v=>v.id)).size===p.variants.length,'معرّفات الأصناف مكررة.');
  p.variants.forEach(v=>{assert(typeof v.id==='string'&&v.id&&typeof v.type==='string'&&v.type.trim(),'بيانات الصنف ناقصة.');assert(Number.isSafeInteger(v.qty)&&Number.isSafeInteger(v.reserved)&&v.qty>=v.reserved&&v.reserved>=0,'رصيد المخزون غير صالح.');integerMoney(v.price);integerMoney(v.cost);integerMoney(stockValue(v));assert(typeof v.sell==='boolean','حالة العرض غير صالحة.');});
  assert(typeof p.publicDescription==='string'&&p.publicDescription.length<=4000,'الوصف طويل جداً.');
  return p;
}
export function safeImage(url){try{const u=new URL(url);return u.protocol==='https:'?u.href:'';}catch{return '';}}
export function publicProduct(p){validateProduct(p);return {id:p.id,code:p.code,name:p.name,genus:p.genus,description:p.publicDescription,care:p.care||'',size:p.size||'',photoDate:p.photoDate||'',actualPhoto:!!p.actualPhoto,image:safeImage(p.image),published:!!p.published&&!p.archived,variants:p.variants.filter(v=>v.sell).map(v=>({id:v.id,type:v.type,price:v.price,available:available(v)})),updatedAt:p.updatedAt};}
export function normalizeItems(items){assert(Array.isArray(items)&&items.length>0&&items.length<=20,'الطلب يحتاج من 1 إلى 20 بنداً.');const seen=new Set();return items.map(it=>{assert(typeof it.productId==='string'&&it.productId&&typeof it.variantId==='string'&&it.variantId,'اختر النبات والصنف لكل بند.');const key=it.productId+'/'+it.variantId;assert(!seen.has(key),'الصنف مكرر؛ اجمع كميته في بند واحد.');seen.add(key);return {...it,qty:quantity(it.qty),price:integerMoney(it.price)};});}
// Pure all-or-nothing plan. The repository commits this plan in one transaction.
export function planOrder(products,input,mode){
  assert(['reserve','sell','fulfill','cancel','return'].includes(mode),'عملية غير معروفة.');
  const ps=structuredClone(products),items=normalizeItems(input.items),movements=[];
  for(const it of items){const p=ps.find(p=>p&&p.id===it.productId);assert(p&&(!p.archived||mode==='return'),'نبات غير موجود أو مؤرشف.');const v=p.variants.find(v=>v.id===it.variantId);assert(v,'الصنف غير موجود.');
    if(mode==='reserve'||mode==='sell'){assert(v.sell,'الصنف غير متاح للبيع.');assert(available(v)>=it.qty,'المخزون لا يكفي: '+p.name+' — '+v.type);}
    if(['reserve','sell','fulfill'].includes(mode)){it.cost=v.cost;it.costValue=v.qty?Math.round(stockValue(v)*it.qty/v.qty):0;}
    const beforeValue=stockValue(v);
    if(mode==='reserve')v.reserved+=it.qty;
    if(mode==='sell')v.qty-=it.qty;
    if(mode==='fulfill'||mode==='cancel'){assert(v.reserved>=it.qty,'الحجز لا يطابق المخزون.');v.reserved-=it.qty;if(mode==='fulfill')v.qty-=it.qty;}
    if(mode==='sell'||mode==='fulfill'){v.value=beforeValue-it.costValue;if(v.qty>0)v.cost=Math.round(v.value/v.qty);}
    if(mode==='return'){if(input.restock){v.value=beforeValue+(it.costValue??it.cost*it.qty);v.qty+=it.qty;v.cost=Math.round(v.value/v.qty);p.archived=false;p.published=false;}}
    it.name=p.name;it.type=v.type;it.code=p.code;
    integerMoney(it.cost);
    movements.push({productId:p.id,variantId:v.id,qty:it.qty,kind:mode,restock:mode==='return'?!!input.restock:null,after:v.qty,reservedAfter:v.reserved});validateProduct(p);
  }
  const subtotal=items.reduce((s,i)=>s+i.qty*i.price,0),cogs=items.reduce((s,i)=>s+(i.costValue??i.qty*i.cost),0);
  integerMoney(subtotal);integerMoney(cogs);const shippingCharged=integerMoney(input.shippingCharged),shippingCost=integerMoney(input.shippingCost);
  return {products:ps,items,movements,subtotal,cogs,total:subtotal+shippingCharged,shippingCharged,shippingCost,profit:subtotal+shippingCharged-cogs-shippingCost};
}
export function receiveStock(product,variantId,q,unitCost,landed=0){const p=structuredClone(product);const v=p.variants.find(v=>v.id===variantId);assert(v,'الصنف غير موجود.');q=quantity(q);integerMoney(unitCost);integerMoney(landed);const value=q*unitCost+landed;v.value=stockValue(v)+value;v.cost=Math.round(v.value/(v.qty+q));v.qty+=q;validateProduct(p);return {product:p,total:value};}
export function paymentState(order){const due=order.total-order.paid;return {due,status:order.paid===0?'لم يُدفع':due===0?'مدفوع بالكامل':'دفع جزئي'};}
export function totals({orders=[],expenses=[],cash=[]},from,to){const within=x=>x.date>=from&&x.date<=to;const sales=orders.filter(o=>['sold','returned'].includes(o.status)&&within(o));const returns=orders.filter(o=>o.status==='returned'&&within({date:o.returnDate}));
  const revenue=sales.reduce((s,o)=>s+o.total,0)-returns.reduce((s,o)=>s+o.total,0);
  const cogs=sales.reduce((s,o)=>s+o.cogs,0)-returns.filter(o=>o.restock).reduce((s,o)=>s+o.cogs,0);
  const shipping=sales.reduce((s,o)=>s+o.shippingCost,0),operating=expenses.filter(within).reduce((s,e)=>s+e.amount,0);
  const incoming=cash.filter(x=>within(x)&&x.direction==='in').reduce((s,x)=>s+x.amount,0),outgoing=cash.filter(x=>within(x)&&x.direction==='out').reduce((s,x)=>s+x.amount,0);
  return {revenue,cogs,shipping,operating,profit:revenue-cogs-shipping-operating,incoming,outgoing,flow:incoming-outgoing,due:orders.filter(o=>o.status==='sold').reduce((s,o)=>s+o.total-o.paid,0)};
}
