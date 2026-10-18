import {productMeta,headers,errorPage,escape} from './seo.mjs';
export async function loadProduct(id){
 // Read only the same published projection available to storefront visitors.
 const r=await fetch('https://firestore.googleapis.com/v1/projects/temo-plants/databases/(default)/documents/tp2_publicProducts/'+encodeURIComponent(id),{signal:AbortSignal.timeout(8000)});
 if(r.status===404||r.status===403)return undefined;if(!r.ok)throw Error('unavailable');
 const {fields:f}=await r.json();return {published:f?.published?.booleanValue===true,name:f?.name?.stringValue||'',description:f?.description?.stringValue||'',actualPhoto:f?.actualPhoto?.booleanValue===true,image:f?.image?.stringValue||'',variants:(f?.variants?.arrayValue?.values||[]).map(v=>({price:Number(v.mapValue?.fields?.price?.integerValue??v.mapValue?.fields?.price?.doubleValue),available:Number(v.mapValue?.fields?.available?.integerValue??v.mapValue?.fields?.available?.doubleValue??0)}))};
}

export function createHandler(load=loadProduct){return async event=>{
 const response=(statusCode,body)=>({statusCode,headers:headers(statusCode===200?300:0),body:event.httpMethod==='HEAD'?'':body});
 if(!['GET','HEAD'].includes(event.httpMethod))return response(405,'');
 const id=event.queryStringParameters?.product;if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id||''))return response(404,errorPage());
 let p;try{p=await load(id);}catch{return response(503,errorPage(503));}
 if(!p?.published)return response(404,errorPage());
 const en=event.queryStringParameters?.lang==='en',m=productMeta(p,id,en?'en':'ar'),target=m.url+(en?'&lang=en':'');
 return response(200,'<!doctype html><html lang="'+(en?'en':'ar')+'" dir="'+(en?'ltr':'rtl')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+m.head+'</head><body><h1>'+escape(p.name)+'</h1><p>'+escape(m.description)+'</p><a href="'+escape(target)+'">'+(en?'View plant in the shop':'عرض النبتة في المتجر')+'</a><script>location.replace('+JSON.stringify(target)+');</script></body></html>');
};}
export const handler=createHandler();
