import {base,escape,headers} from './seo.mjs';
export async function listPublished(){
 const r=await fetch('https://firestore.googleapis.com/v1/projects/temo-plants/databases/(default)/documents:runQuery',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({structuredQuery:{select:{fields:[{fieldPath:'__name__'}]},from:[{collectionId:'tp2_publicProducts'}],where:{fieldFilter:{field:{fieldPath:'published'},op:'EQUAL',value:{booleanValue:true}}},limit:50000}})});
 if(!r.ok)throw Error('unavailable');return (await r.json()).filter(x=>x.document).map(x=>x.document.name.split('/').pop());
}
export function createSitemapHandler(load=listPublished){return async event=>{
 const h={...headers(),'Content-Type':'application/xml; charset=utf-8'};
 if(!['GET','HEAD'].includes(event.httpMethod))return {statusCode:405,headers:h,body:''};
 try{const ids=await load();if(ids.length>=50000)throw Error('Sitemap requires pagination');
 const urls=[base+'/shop.html',...ids.map(id=>base+'/shop.html?product='+encodeURIComponent(id))];
 return {statusCode:200,headers:{...headers(3600),'Content-Type':'application/xml; charset=utf-8'},body:event.httpMethod==='HEAD'?'':'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>'<url><loc>'+escape(u)+'</loc></url>').join('')+'</urlset>'};
 }catch{return {statusCode:503,headers:h,body:''};}
};}
export const handler=createSitemapHandler();
