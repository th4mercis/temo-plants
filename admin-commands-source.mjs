import {createServices} from '../../service-core.js';
import {createMigration} from '../../migration-core.js';
import {createAdminStore} from '../../admin-store.mjs';
import {PublicError,parseBody,errorResponse,consumeLimit,requireRecentAdmin} from '../../security.mjs';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(statusCode===429?{'Retry-After':'60'}:{})},body:JSON.stringify(data)});
const arities={health:[1,1],receivePlant:[2,3],saveProduct:[1,2],stockChange:[1,2],createOrder:[2,3],discountOrder:[2,3],orderAction:[2,4],expense:[1,2],supply:[1,2],setVariantHidden:[3,4],appendOrderItems:[2,3],correctPurchaseCost:[1,2],correctOpeningCost:[1,2],saveCustomer:[1,2],importLegacy:[1,1],restoreBackup:[1,1]};
async function setup(){
 const [{initializeApp,cert,getApps},{getAuth},{getFirestore}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/auth'),import('firebase-admin/firestore')]);
 const credentials=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'{}');if(credentials.project_id!=='temo-plants')throw Error('config');
 const app=getApps().find(a=>a.name==='admin-commands')||initializeApp({credential:cert(credentials)},'admin-commands');return {db:getFirestore(app),auth:getAuth(app)};
}
export function createHandler(load=setup){let runtime;return async event=>{
 if(event.httpMethod!=='POST')return reply(405,{error:'استخدم POST.'});
 if(!['https://temoplants.com','https://www.temoplants.com','https://temoplants.netlify.app'].includes(event.headers?.origin))return reply(403,{error:'افتح لوحة الإدارة من موقع المتجر.'});
 let body;
 try{body=parseBody(event,4_000_000);const shape=arities[body.action];if(!Object.hasOwn(arities,body.action)||!Array.isArray(body.args)||body.args.length<shape[0]||body.args.length>shape[1]||!body.args[0]||typeof body.args[0]!=='object'||Array.isArray(body.args[0]))throw new PublicError('عملية غير صالحة.');}catch(e){return reply(400,{error:'عملية غير صالحة.'});}
 let rt;try{runtime||=await load();rt=runtime;}catch(e){console.error(JSON.stringify({event:'admin-setup-failed',code:e?.code||'config',kind:e?.name||'Error',missingModule:e?.code==='MODULE_NOT_FOUND'?String(e.message).match(/Cannot find module '([^']+)'/)?.[1]:'none',hasCredential:!!process.env.FIREBASE_SERVICE_ACCOUNT,node:process.version}));return reply(503,{error:'خدمة الحفظ غير متاحة مؤقتاً.'});}
 let user;
 try{const token=event.headers.authorization||'';if(!token.startsWith('Bearer '))throw Error();user=await rt.auth.verifyIdToken(token.slice(7),true);if((await rt.db.doc('admins/'+user.uid).get()).data()?.active!==true)throw Error();}catch{return reply(403,{error:'سجّل الدخول بحساب مدير مخوّل.'});}
 try{
  requireRecentAdmin(user);if(body.action==='health')return reply(200,{result:'خدمة الحفظ الآمن متصلة — الإصدار security-2026-10-04'});await consumeLimit(rt.db,'admin:'+user.uid,'commands',60);
  const store=createAdminStore(rt.db,user,body),api={...createServices(store),...createMigration(store)};
  return reply(200,{result:await api[body.action](...body.args)});
 }catch(e){const failure=errorResponse(e,body.action);return reply(failure.status,failure.data);}
};}
export const handler=createHandler();
export const config={rateLimit:{windowLimit:90,windowSize:60,aggregateBy:['ip','domain']}};
