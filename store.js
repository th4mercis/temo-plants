import {firebaseConfig,LIVE_ENABLED} from './config.js';
import {id} from './domain.js';
export const demo=new URLSearchParams(location.search).get('demo')==='1';
export const collections=['customers','products','orders','purchases','expenses','cash','movements','supplies','shipments','audit','legacy'];
const prefix='tp2_',demoKey='temo-v2-demo-only';
let sdk,db,auth,storage,listeners=[],user=null;
function readDemo(){try{return JSON.parse(localStorage.getItem(demoKey))||{};}catch{return {};}}
function demoSeed(){if(localStorage.getItem(demoKey))return;const d={};const names=[['Alocasia Frydek Variegata','Alocasia',29500],['Anthurium crystallinum','Anthurium',24000],['Monstera Thai Constellation','Monstera',38000]];names.forEach(([name,genus,price],i)=>{const p={id:'demo-'+i,code:'TP-00'+(i+1),name,genus,publicDescription:'بيانات تجريبية لاستعراض تجربة المتجر. استفسر عن صور القطعة وحالة الجذور قبل الطلب.',internalNotes:'مثال داخلي لا يظهر في المتجر',care:'إضاءة ساطعة غير مباشرة، وري حسب جفاف الوسط.',size:'شتلة متأقلمة',image:'',photoDate:'',actualPhoto:false,published:true,archived:false,revision:1,updatedAt:new Date().toISOString(),variants:[{id:'v1',type:'شتلة',qty:3+i,reserved:0,cost:Math.round(price*.45),price,sell:true}]};d['products/'+p.id]=p;d['publicProducts/'+p.id]={id:p.id,code:p.code,name,genus,description:p.publicDescription,care:p.care,size:p.size,image:'',photoDate:'',actualPhoto:false,published:true,variants:[{id:'v1',type:'شتلة',price,available:3+i}],updatedAt:p.updatedAt};});localStorage.setItem(demoKey,JSON.stringify(d));}
export async function connect(){
  if(demo){demoSeed();user={uid:'demo-owner',email:'demo@example.test'};return;}
  if(!LIVE_ENABLED)throw new Error('النسخة الحية لم تُفعّل بعد. استخدم المعاينة التجريبية أو اتبع دليل تفعيل Firebase.');
  const base='https://www.gstatic.com/firebasejs/12.19.0/';
  const [app,f,a,s]=await Promise.all(['firebase-app.js','firebase-firestore.js','firebase-auth.js','firebase-storage.js'].map(x=>import(base+x)));
  sdk={...f,...a,...s};const instance=app.getApps().find(a=>a.name==='backup-only')||app.initializeApp(firebaseConfig,'backup-only');db=f.getFirestore(instance);auth=a.getAuth(instance);storage=s.getStorage(instance);s.setMaxUploadRetryTime(storage,20000);s.setMaxOperationRetryTime(storage,20000);await a.setPersistence(auth,a.browserSessionPersistence);
}
export async function login(email,password){if(demo)return user;const r=await sdk.signInWithEmailAndPassword(auth,email,password);user=r.user;await checkAdmin();return user;}
export async function checkAdmin(){if(demo)return true;const s=await sdk.getDoc(sdk.doc(db,'admins',auth.currentUser.uid));if(!s.exists()||s.data().active!==true){await sdk.signOut(auth);throw new Error('هذا الحساب غير مخوّل للإدارة. راجع خطوة إضافة UID في الدليل.');}user=auth.currentUser;return true;}
export function watchAuth(fn){if(demo){fn(user);return ()=>{};}return sdk.onAuthStateChanged(auth,fn);}
export async function logout(){listeners.forEach(f=>f());listeners=[];if(!demo)await sdk.signOut(auth);user=null;}
export const uid=()=>demo?'demo-owner':auth?.currentUser?.uid;
export async function get(path){if(demo)return structuredClone(readDemo()[path]||null);const [c,i]=path.split('/');const s=await sdk.getDoc(sdk.doc(db,prefix+c,i));return s.exists()?s.data():null;}
export async function getLegacy(){if(demo)return null;const s=await sdk.getDoc(sdk.doc(db,'temo','main'));return s.exists()?s.data():null;}
export async function list(c){if(demo)return Object.entries(readDemo()).filter(([k])=>k.startsWith(c+'/')).map(([,v])=>v);const s=await sdk.getDocs(sdk.collection(db,prefix+c));return s.docs.map(x=>x.data());}
export function subscribe(c,fn,error){
  if(demo){const update=()=>fn(Object.entries(readDemo()).filter(([k])=>k.startsWith(c+'/')).map(([,v])=>v));update();addEventListener('storage',update);addEventListener('demo-change',update);const stop=()=>{removeEventListener('storage',update);removeEventListener('demo-change',update);};listeners.push(stop);return stop;}
  let q=sdk.collection(db,prefix+c);if(c==='publicProducts')q=sdk.query(q,sdk.where('published','==',true));
  const stop=sdk.onSnapshot(q,s=>fn(s.docs.map(d=>d.data())),error);listeners.push(stop);return stop;
}
export async function atomic(paths,build){
  paths=[...new Set(paths)];
  if(demo){return navigator.locks.request('temo-demo-transaction',async()=>{const data=readDemo(),docs=Object.fromEntries(paths.map(p=>[p,structuredClone(data[p]||null)]));const plan=await build(docs);for(const [p,v]of Object.entries(plan.writes||{}))data[p]=v;localStorage.setItem(demoKey,JSON.stringify(data));dispatchEvent(new Event('demo-change'));return plan.result;});}
  return sdk.runTransaction(db,async tx=>{const refs=paths.map(p=>{const [c,i]=p.split('/');return sdk.doc(db,prefix+c,i);});const snaps=await Promise.all(refs.map(r=>tx.get(r)));const docs=Object.fromEntries(paths.map((p,i)=>[p,snaps[i].exists()?snaps[i].data():null]));const plan=await build(docs);for(const [p,v]of Object.entries(plan.writes||{})){const [c,i]=p.split('/');tx.set(sdk.doc(db,prefix+c,i),v);}return plan.result;});
}
export async function uploadImage(file){
  if(!file)return '';if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('اختر صورة JPG أو PNG أو WebP.');if(file.size>12*1024*1024)throw new Error('الصورة كبيرة؛ الحد 12MB قبل الضغط.');
  const bmp=await createImageBitmap(file);if(bmp.width*bmp.height>40000000){bmp.close();throw new Error('أبعاد الصورة كبيرة جداً.');}
  const scale=Math.min(1,1400/Math.max(bmp.width,bmp.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bmp.width*scale);canvas.height=Math.round(bmp.height*scale);canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',.82));if(!blob||blob.size>2*1024*1024)throw new Error('تعذر ضغط الصورة إلى حجم مناسب.');
  if(demo)throw new Error('رفع الصور متاح بعد تفعيل Firebase؛ المعاينة لا ترفع ملفات.');
  const r=sdk.ref(storage,'catalog/'+id()+'.webp');const task=sdk.uploadBytesResumable(r,blob,{contentType:'image/webp',cacheControl:'public,max-age=31536000,immutable'});let timer;try{await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{task.cancel();reject(new Error('انتهت مهلة رفع الصورة. تحقق من تفعيل Firebase Storage والفوترة وقواعد الصور، ثم أعد المحاولة. بيانات النموذج محفوظة في الشاشة.'));},25000);})]);return await sdk.getDownloadURL(r);}catch(e){if(e.code?.startsWith('storage/'))throw new Error('تعذر رفع الصورة. تحقق من تفعيل Storage وقواعده والاتصال. لم تُحفظ تعديلات النبتة؛ يمكنك إعادة المحاولة.');throw e;}finally{clearTimeout(timer);}
}

