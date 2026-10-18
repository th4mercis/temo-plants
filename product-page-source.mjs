import {loadProduct} from './product-share-source.mjs';
import {productMeta,headers as cacheHeaders,errorPage,escape} from './seo.mjs';
import {idForSlug,slugFromPath,productPath,setProductRoutes} from './plant-routes.js';
import {listPublished} from './public-catalog-source.mjs';
export function renderProductPage(template,p,id,lang='ar'){
 const {image,description,head}=productMeta(p,id,lang);
 return template.replace('<html lang="ar" dir="rtl">',lang==='en'?'<html lang="en" dir="ltr">':'<html lang="ar" dir="rtl">').replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\b[^>]*(?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/gi,'').replace(/<link\b[^>]*rel="canonical"[^>]*>/gi,'')
 .replace('</head>',head+'</head>').replace('class="shop-page catalog-loading"','class="shop-page has-product"')
 .replace('id="hero"','id="hero" hidden').replace('id="catalog-view"','id="catalog-view" hidden')
 .replace('<div id="product-view" hidden></div>',`<div id="product-view"><article class="product-detail" data-server-product="${escape(id)}"><div><img class="detail-image" src="${escape(image)}" alt="${escape(p.name)}" width="800" height="1000"></div><div><h1>${escape(p.name)}</h1><p>${escape(description)}</p><p role="status">جارٍ تحديث السعر والتوفر…</p><a class="button" href="/shop.html">العودة للمجموعة</a></div></article></div>`);
}
export function createPageHandler(template,load=loadProduct,list=listPublished){return async event=>{
 const headers=cacheHeaders();
 const response=(statusCode,body)=>({statusCode,headers,body:event.httpMethod==='HEAD'?'':body});
 if(!['GET','HEAD'].includes(event.httpMethod))return response(405,'');
 const q=event.queryStringParameters||{},path=event.path||'',slug=slugFromPath(path);let id=q.product;
 if(path.startsWith('/plants/')&&!slug)return response(404,errorPage());
 if(slug){id=idForSlug(slug);if(!id){try{setProductRoutes(await list());id=idForSlug(slug);}catch{return response(503,errorPage(503));}}if(!id)return response(404,errorPage());}
 // Catalogue and demo keep their existing client-rendered flow, without a database read.
 if(!slug&&(!id||q.demo==='1')){Object.assign(headers,cacheHeaders(3600));return response(200,template);}
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return response(404,errorPage());
 let p;try{p=await load(id);}catch{return response(503,errorPage(503));}
 if(!p?.published)return response(404,errorPage());
 // Normalize legacy ID URLs and trailing slashes on the current host, including previews.
 if(!slug||path!==productPath(p,id)){
  const params=new URLSearchParams();if(q.lang==='en'||q.lang==='ar')params.set('lang',q.lang);
  const location=productPath(p,id)+(params.size?'?'+params:'');
  return {statusCode:301,headers:{...cacheHeaders(300),Location:location},body:''};
 }
 Object.assign(headers,cacheHeaders(300));
 return response(200,renderProductPage(template,p,id,q.lang));
};}
