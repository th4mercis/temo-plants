const base='https://temoplants.com';
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadProduct(id){
 const [{initializeApp,cert,getApps},{getFirestore}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore')]);
 const c=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'{}');if(c.project_id!=='temo-plants')throw Error('config');
 const app=getApps().find(a=>a.name==='share-temo')||initializeApp({credential:cert(c)},'share-temo');
 return (await getFirestore(app).doc('tp2_publicProducts/'+id).get()).data();
}
export function createHandler(load=loadProduct){return async event=>{
 const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(!['GET','HEAD'].includes(event.httpMethod))return {statusCode:405,headers,body:''};
 const id=event.queryStringParameters?.product;if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id||''))return {statusCode:404,headers,body:'Not found'};
 let p;try{p=await load(id);}catch{return {statusCode:503,headers,body:'Temporarily unavailable'};}
 if(!p?.published)return {statusCode:404,headers,body:'Not found'};
 let image=base+'/brand-logo-d9723ed1a9.webp';try{const u=new URL(p.image);if(u.protocol==='https:')image=u.href;}catch{}
 const title=p.name+' | Temo Plants',description=(p.actualPhoto?'الصورة للقطعة الفعلية. ':'صورة مرجعية؛ راجع صورة القطعة قبل الشراء. ')+String(p.description||'').slice(0,220),url=base+'/share.html?product='+encodeURIComponent(id),target=base+'/shop.html?product='+encodeURIComponent(id);
 const body=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta property="og:type" content="product"><meta property="og:site_name" content="Temo Plants"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:alt" content="${escape(p.name)}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(image)}"><link rel="canonical" href="${escape(target)}"></head><body><h1>${escape(p.name)}</h1><p>${escape(description)}</p><a href="${escape(target)}">عرض النبتة في المتجر</a><script>location.replace(${JSON.stringify(target)});</script></body></html>`;
 return {statusCode:200,headers,body:event.httpMethod==='HEAD'?'':body};
};}
export const handler=createHandler();
