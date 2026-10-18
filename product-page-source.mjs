import {loadProduct} from './product-share-source.mjs';
const base='https://temoplants.com';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderProductPage(template,p,id){
 const canonical=base+'/shop.html?product='+encodeURIComponent(id);
 const title=p.name+' | Temo Plants',description=(p.actualPhoto?'الصورة للقطعة الفعلية. ':'صورة مرجعية؛ راجع صورة القطعة قبل الشراء. ')+String(p.description||'').slice(0,220);
 let image=base+'/brand-logo-d9723ed1a9.webp';try{const u=new URL(p.image);if(u.protocol==='https:')image=u.href;}catch{}
 const head=`<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:type" content="product"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:image" content="${escape(image)}"><meta property="og:url" content="${escape(canonical)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(image)}">`;
 return template.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\b[^>]*(?:name="description"|property="og:[^"]*")[^>]*>/gi,'').replace(/<link\b[^>]*rel="canonical"[^>]*>/gi,'')
 .replace('</head>',head+'</head>').replace('class="shop-page catalog-loading"','class="shop-page has-product"')
 .replace('id="hero"','id="hero" hidden').replace('id="catalog-view"','id="catalog-view" hidden')
 .replace('<div id="product-view" hidden></div>',`<div id="product-view"><article class="product-detail" data-server-product="${escape(id)}"><div><img class="detail-image" src="${escape(image)}" alt="${escape(p.name)}" width="800" height="1000"></div><div><h1>${escape(p.name)}</h1><p>${escape(description)}</p><p role="status">جارٍ تحديث السعر والتوفر…</p><a class="button" href="shop.html">العودة للمجموعة</a></div></article></div>`);
}
export function createPageHandler(template,load=loadProduct){return async event=>{
 const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const response=(statusCode,body)=>({statusCode,headers,body:event.httpMethod==='HEAD'?'':body});
 if(!['GET','HEAD'].includes(event.httpMethod))return response(405,'');
 const q=event.queryStringParameters||{},id=q.product;
 // Catalogue and demo keep their existing client-rendered flow, without a database read.
 if(!id||q.demo==='1')return response(200,template);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return response(404,'Not found');
 let p;try{p=await load(id);}catch{return response(503,'Temporarily unavailable');}
 if(!p?.published)return response(404,'Not found');
 return response(200,renderProductPage(template,p,id));
};}
