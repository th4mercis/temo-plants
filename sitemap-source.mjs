import {base,escape,headers} from './seo.mjs';
import {listPublished} from './public-catalog-source.mjs';
import {productPath,setProductRoutes} from './plant-routes.js';
export {listPublished};
export function createSitemapHandler(load=listPublished){return async event=>{
 const h={...headers(),'Content-Type':'application/xml; charset=utf-8'};
 if(!['GET','HEAD'].includes(event.httpMethod))return {statusCode:405,headers:h,body:''};
 try{const ids=await load();if(ids.length>=50000)throw Error('Sitemap requires pagination');
 setProductRoutes(ids);const urls=[base+'/shop.html',...ids.map(p=>base+productPath(p,p.id))];
 return {statusCode:200,headers:{...headers(3600),'Content-Type':'application/xml; charset=utf-8'},body:event.httpMethod==='HEAD'?'':'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>'<url><loc>'+escape(u)+'</loc></url>').join('')+'</urlset>'};
 }catch{return {statusCode:503,headers:h,body:''};}
};}
export const handler=createSitemapHandler();
