import {el,field,select} from './ui.js';
export const genera=[['Alocasia','ألوكاسيا'],['Anthurium','أنثوريوم'],['Hoya','هويا'],['Monstera','مونستيرا'],['Philodendron','فيلودندرون'],['Begonia','بيجونيا']];
export const searchKey=s=>String(s||'').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/[\u064B-\u065F\u0640]/g,'');
export const genusKey=s=>{const key=searchKey(s).replace(/^philo$/,'philodendron');return genera.find(([en,ar])=>searchKey(en)===key||searchKey(ar)===key)?.[0].toLowerCase()||key;};
export function genusField(current='Alocasia'){
 const known=genera.find(([v])=>genusKey(v)===genusKey(current));
 const choice=select('النوع النباتي','genusChoice',[...genera.map(([v,a])=>[v,v+' — '+a]),['other','أخرى — اكتب النوع']],known?.[0]||'other');
 const custom=field('اكتب النوع النباتي','genusOther','text',known?'':current,{required:'',maxlength:'100'});
 const update=()=>{custom.hidden=choice.querySelector('select').value!=='other';custom.querySelector('input').disabled=custom.hidden;};choice.addEventListener('change',update);update();
 return el('div',{class:'stack'},choice,custom);
}
export const readGenus=f=>String(f.get('genusChoice')==='other'?f.get('genusOther'):f.get('genusChoice')).trim();
export const genusSearch=s=>{const key=genusKey(s),row=genera.find(([v])=>genusKey(v)===key);return row?row.join(' '):s;};
