import {available,variantHidden} from './domain.js';
export function saleEntries(products){return products.filter(p=>!p.archived).flatMap(p=>p.variants.filter(v=>v.sell&&!variantHidden(v)).map(v=>({p,v,status:available(v)<=0?'empty':p.published?'live':'draft'})));}
