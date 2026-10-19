export const id = () => crypto.randomUUID();
export class ValidationError extends Error { constructor(message){super(message);this.name='ValidationError';} }
export function assert(ok,message){if(!ok)throw new ValidationError(message);}
export function quantity(value){const n=Number(value);assert(value!==''&&Number.isSafeInteger(n)&&n>0&&n<=100000,'أدخل كمية صحيحة موجبة (حتى 100000).');return n;}
export function money(value){assert(value!==''&&value!==null&&value!==undefined,'أدخل المبلغ.');const n=Number(value);assert(Number.isFinite(n)&&n>=0&&n<=10000000,'المبلغ غير صالح.');assert(Math.abs(n*100-Math.round(n*100))<.000001,'المبلغ يقبل منزلتين عشريتين فقط.');return Math.round(n*100);}
export function integerMoney(n){assert(Number.isSafeInteger(n)&&n>=0&&n<=1000000000,'قيمة مالية غير صالحة.');return n;}
export const formatMoney = n => new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',minimumFractionDigits:2}).format(n/100);
export function localDate(date=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
export const available=v=>v.qty-v.reserved;
export function safeImage(url){try{const u=new URL(url);return u.protocol==='https:'?u.href:'';}catch{return '';}}
