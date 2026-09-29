import {createHash} from 'node:crypto';
import {publicInput} from './market-provider.mjs';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(data)});
export function makeHandler({authorize,cacheGet,cacheSet,consume,search,enabled=true,clock=()=>Date.now()}){
 return async event=>{
  if(event.httpMethod!=='POST')return reply(405,{error:'استخدم POST.'});
  if((event.body||'').length>12000)return reply(413,{error:'الطلب كبير جداً.'});
  let user;try{user=await authorize(event.headers?.authorization||event.headers?.Authorization||'');}catch{return reply(403,{error:'سجّل الدخول بحساب مدير مخوّل.'});}
  if(!enabled)return reply(503,{error:'البحث الحي غير مفعّل. يلزم إعداد مفتاح المزود على الخادم؛ يمكنك إضافة مقارنات يدوية.'});
  let input,refresh;try{const body=JSON.parse(event.body||'{}');input=publicInput(body.input);refresh=body.refresh===true;}catch{return reply(400,{error:'مدخلات البحث غير صالحة.'});}
  // Tenant comes exclusively from verified server credentials, never the browser.
  const hash=createHash('sha256').update(JSON.stringify({tenant:user.tenant,input,version:2})).digest('hex');
  try{const cache=await cacheGet(hash);if(!refresh&&cache&&clock()-cache.timestamp<86400000)return reply(200,{...cache.result,cached:true});
   await consume(user);const result=await search(input);await cacheSet(hash,{timestamp:clock(),result,uid:user.uid,input});return reply(200,{...result,cached:false});
  }catch(e){return reply(e.code==='LIMIT'?429:502,{error:e.code==='LIMIT'?'بلغت حد البحث (10 يومياً للمتجر، ودقيقة بين الطلبات).':e.message||'تعذر البحث؛ مدخلاتك محفوظة.'});}
 };
}
