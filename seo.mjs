export const base='https://temoplants.com';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function headers(seconds=0,query='product|demo|lang'){
 return {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(seconds?{'Netlify-CDN-Cache-Control':`public, durable, s-maxage=${seconds}`,'Netlify-Vary':`query=${query}`}:{})};
}
export function errorPage(status=404){return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${status===404?'الصفحة غير موجودة':'تعذر تحميل الصفحة'} | Temo Plants</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/shop-layout.css"><link rel="icon" href="/favicon.ico"></head><body class="shop-page"><main class="shop-error"><img src="/brand-logo-d9723ed1a9.webp" width="110" height="110" alt="Temo Plants"><p>${status}</p><h1>${status===404?'لم نجد هذه الصفحة':'تعذر تحميل الصفحة مؤقتًا'}</h1><p>${status===404?'قد تكون النبتة لم تعد منشورة، أو تغيّر الرابط. يمكنك العودة واستكشاف المجموعة.':'حاول مرة أخرى بعد قليل، أو عد إلى المتجر.'}</p><a class="button primary" href="/shop.html">العودة للمتجر</a></main><script type="module" src="/shop-language-init.js"></script></body></html>`;}
export function productMeta(p,id,lang='ar'){
 const en=lang==='en';
 const url=base+'/shop.html?product='+encodeURIComponent(id),title=p.name+' | Temo Plants';
 let image=base+'/social-preview.jpg';try{const u=new URL(p.image);if(u.protocol==='https:')image=u.href;}catch{}
 const variants=(p.variants||[]).filter(v=>Number.isFinite(v.price)&&v.price>0),available=variants.filter(v=>v.available>0);
 const offers=(available.length?available:variants).map(v=>({'@type':'Offer',url,priceCurrency:'SAR',price:v.price/100,availability:'https://schema.org/'+(v.available>0?'InStock':'OutOfStock')}));
 const stock=(p.variants||[]).some(v=>v.available>0),prices=available.map(v=>v.price);
 const price=prices.length?(new Set(prices).size>1?(en?'From ':'من '):'')+new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Math.min(...prices)/100)+(en?' SAR':' ر.س'):stock?(en?'Price being updated':'السعر قيد التحديث'):'';
 const summary=[p.name,price,stock?(en?'In stock':'متوفر'):(en?'Out of stock':'غير متوفر حالياً')].filter(Boolean).join(' · ');
 const description=summary+'. '+(p.actualPhoto?(en?'Actual specimen photo. ':'الصورة للقطعة الفعلية. '):(en?'Reference photo; request an actual specimen photo before buying. ':'صورة مرجعية؛ راجع صورة القطعة قبل الشراء. '))+(en&&/[\u0600-\u06ff]/.test(p.description||'')?'':String(p.description||'').slice(0,220));
 const data={'@context':'https://schema.org','@type':'Product',name:p.name,image:[image],description,sku:id,...(offers.length?{offers}: {})};
 const head=`<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(url)}"><meta property="og:type" content="product"><meta property="og:site_name" content="Temo Plants"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:image" content="${escape(image)}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(image)}"><script id="product-structured-data" type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`;
 return {url,title,image,description,head,data};
}
