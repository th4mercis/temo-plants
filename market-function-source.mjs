import {makeHandler} from '../../market-handler.mjs';
import {searchMarket} from '../../market-provider.mjs';
let runtime;
async function setup(){
 const [{initializeApp,cert,getApps},{getAuth},{getFirestore}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/auth'),import('firebase-admin/firestore')]);
 const credentials=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'{}');
 if(credentials.project_id!=='temo-plants')throw new Error('Wrong project');
 const app=getApps().find(a=>a.name==='market-temo')||initializeApp({credential:cert(credentials)},'market-temo'),db=getFirestore(app);
 return makeHandler({
  enabled:!!process.env.OPENAI_API_KEY&&!!process.env.MARKET_MODEL,
  authorize:async header=>{if(!header.startsWith('Bearer '))throw Error('auth');const u=await getAuth(app).verifyIdToken(header.slice(7),true);const a=await db.doc('admins/'+u.uid).get();if(a.data()?.active!==true)throw Error('admin');return {uid:u.uid,tenant:credentials.project_id};},
  cacheGet:async key=>(await db.doc('marketPrivateCache/'+key).get()).data(),
  cacheSet:async(key,value)=>{await db.doc('marketPrivateCache/'+key).set(value);await db.collection('marketPrivateHistory').add(value);},
  consume:async user=>db.runTransaction(async tx=>{const ref=db.doc('marketPrivateLimits/'+user.tenant),snap=await tx.get(ref),data=snap.data()||{},now=Date.now(),day=new Date(now).toISOString().slice(0,10),count=data.day===day?data.count:0;if(count>=10||now-(data.last||0)<60000){const e=Error('limit');e.code='LIMIT';throw e;}tx.set(ref,{day,count:count+1,last:now});}),
  search:input=>searchMarket(input,{key:process.env.OPENAI_API_KEY,model:process.env.MARKET_MODEL})
 });
}
export async function handler(event){try{runtime||=await setup();return await runtime(event);}catch{return {statusCode:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({error:'خدمة البحث غير مهيأة بعد. استخدم المقارنات اليدوية مؤقتاً.'})};}}
