// Deterministic estimates: AI finds evidence; it never invents the price.
export const market = {country:'SA',currency:'SAR',scale:100};
export const forms=[['mother','نبتة أم'],['baby','شتلة'],['corm','كورمة'],['cutting','كتنج'],['custom','صنف مخصص']];
export const stages=[['unknown','غير محدد'],['raw','خام / غير منبت'],['sprouted','منبت'],['rooted','مجذر'],['established','متأقلم']];
const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function estimate(input,rows,now=new Date()){
 const today=now.toISOString().slice(0,10),eligible=[],excluded=[],seen=new Set();
 for(const source of rows){const r={...source};let why='';const url=safeURL(r.url),age=(Date.parse(today)-Date.parse(r.date))/86400000;
  const key=url?url.split('?')[0].replace(/\/$/,'').toLowerCase():r.evidenceId;
  if(!r.reviewed)why='لم تُراجع المقارنة';
  else if(!input.identityConfirmed)why='هوية النبات تحتاج تأكيداً';
  else if(norm(r.name)!==norm(input.name)||r.form!==input.form||norm(r.custom)!==norm(input.custom))why='اختلاف الاسم أو الصنف';
  else if(input.stage==='unknown'||r.stage!==input.stage)why='مرحلة النمو غير متطابقة أو مجهولة';
  else if(r.match!=='exact')why='الحجم والتبرقش والحالة غير مؤكدة التطابق';
  else if(!validDate(r.date)||age<0||age>90)why='تاريخ مجهول أو أقدم من 90 يوماً';
  else if(!key)why='رابط أو صورة إعلان مطلوبة';
  else if(seen.has(key))why='إعلان مكرر';
  else if(r.saleType!=='retail')why='جملة أو مزاد غير قابل للمقارنة';
  else if(!Number.isFinite(r.price)||r.price<=0||r.price>10000000||!Number.isInteger(r.units)||r.units<1)why='سعر أو عدد قطع غير صالح';
  else if(!/^[A-Z]{2}$/.test(r.country||'')||! /^[A-Z]{3}$/.test(r.currency||''))why='بلد أو عملة غير محددة';
  let converted=null;
  if(!why){seen.add(key);if(r.currency===market.currency)converted=r.price/r.units;else if(Number.isFinite(r.fx)&&r.fx>0&&validDate(r.fxDate)&&r.fxDate<=today&&(Date.parse(today)-Date.parse(r.fxDate))/86400000<=7&&safeURL(r.fxSource))converted=r.price/r.units*r.fx;else why='يلزم سعر صرف موثق خلال آخر 7 أيام';}
  if(why){excluded.push({...r,why});continue;}
  const costs=['shipping','duties','permits','acclimation'];
  eligible.push({...r,url,converted,landed:costs.every(k=>Number.isFinite(r[k])&&r[k]>=0)?converted+costs.reduce((s,k)=>s+r[k],0):null});
 }
 const local=eligible.filter(r=>r.country===market.country),foreign=eligible.filter(r=>r.country!==market.country);
 const q=(values,f)=>{const a=[...values].sort((a,b)=>a-b),i=(a.length-1)*f;return a[Math.floor(i)]+(a[Math.ceil(i)]-a[Math.floor(i)])*(i%1);};
 let retained=local;
 if(local.length>=5){const a=local.map(r=>r.converted),lo=q(a,.25),hi=q(a,.75),iqr=hi-lo;if(iqr>0){retained=local.filter(r=>r.converted>=lo-1.5*iqr&&r.converted<=hi+1.5*iqr);for(const r of local.filter(r=>!retained.includes(r)))excluded.push({...r,why:'قيمة شاذة وفق نطاق IQR'});}}
 const prices=retained.map(r=>r.converted),sold=retained.filter(r=>r.status==='sold'&&r.soldEvidence===true),round=n=>Math.round(n*market.scale);
 const range=prices.length>=3?[round(q(prices,.25)),round(q(prices,.75))]:null;
 const median=range?round(q(prices,.5)):null;
 const quick=sold.length>=5?[round(q(sold.map(r=>r.converted),.1)),round(q(sold.map(r=>r.converted),.25))]:null;
 return {version:1,createdAt:now.toISOString(),currency:market.currency,input:structuredClone(input),range,median,quick,local:retained,foreign,excluded,
 confidence:range?(retained.length>=5&&sold.length>=3?'متوسطة':'منخفضة'):'غير كافية',
 reasons:[range?'النطاق هو الربع الأوسط للمقارنات المحلية؛ ليس ضماناً لسعر البيع.':'البيانات غير كافية لتقدير موثوق: يلزم 3 مقارنات محلية حديثة متطابقة ومراجعة.',sold.length+' مقارنات بيع مكتمل موثقة؛ باقي الأسعار عروض.', 'لم يُفترض خصم للبيع السريع أو تكلفة استيراد مجهولة.','تأثير الحجم والتبرقش والصحة عبر اختيار المقارنات المتطابقة؛ لا توجد زيادات سعرية تخمينية.']};
}
