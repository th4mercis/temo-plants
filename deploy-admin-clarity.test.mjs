import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryEntries,variantState,salePriceLabel} from './sale-catalog.js';
test('collection is not flagged as unpriced even with a retained historical sale price',()=>{
 const v={sell:false,price:0,qty:1,reserved:0};
 assert.equal(variantState({published:true},v),'collection');
 assert.equal(salePriceLabel(v),'غير مطروح للبيع');
 assert.equal(salePriceLabel({...v,price:70000}),'غير مطروح للبيع');
});
test('unpublished inventory does not imply it is ready for sale',()=>{
 const v={sell:true,price:0,qty:1,reserved:0};
 assert.equal(variantState({published:false},v),'unpriced');
 assert.equal(salePriceLabel(v),'سعر البيع غير محدد');
 assert.equal(variantState({published:false},{...v,price:30000}),'draft');
 // A zero-price published item is still published; never silently hide it.
 assert.equal(variantState({published:true},v),'live');
});
test('full reservations and empty stock are distinct without inventing a sold status',()=>{
 assert.equal(variantState({published:true},{sell:true,qty:2,reserved:2}),'reserved');
 assert.equal(variantState({published:true},{sell:true,qty:0,reserved:0}),'empty');
});
test('inventory view includes private mothers, excludes archives and hidden variants, never mutates',()=>{
 const products=[{published:true,variants:[{id:'mother',sell:false,qty:1,reserved:0},{id:'corm',sell:true,qty:2,reserved:0,price:30000},{id:'hidden',hidden:true,qty:0,reserved:0}]},{archived:true,variants:[{id:'old'}]}];
 const before=structuredClone(products);
 assert.deepEqual(inventoryEntries(products).map(x=>[x.v.id,x.status]),[['mother','collection'],['corm','live']]);
 assert.deepEqual(products,before);
});
