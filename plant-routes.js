import {savedRoutes} from './plant-route-names.js';
export function slugify(name){return String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,'-').replace(/^-+|-+$/g,'').slice(0,150)||'plant';}
let routes={...savedRoutes};
export function setProductRoutes(rows){
 const next={...savedRoutes},used=new Set(Object.values(next));
 for(const p of [...rows].sort((a,b)=>a.id.localeCompare(b.id))){if(next[p.id])continue;const stem=slugify(p.name);let slug=stem;if(used.has(slug))slug=stem+'--'+p.id;next[p.id]=slug;used.add(slug);}
 routes=next;return {...next};
}
export const productSlug=(p,id=p.id)=>routes[id]||slugify(p.name);
export const productPath=(p,id=p.id)=>'/plants/'+encodeURIComponent(productSlug(p,id));
export function idForSlug(slug){return Object.keys(routes).find(id=>routes[id]===slug);}
export function slugFromPath(path){try{return /^\/plants\/([^/]+)\/?$/.exec(decodeURI(path))?.[1]||'';}catch{return '';}}
