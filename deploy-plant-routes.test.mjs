import test from 'node:test';
import assert from 'node:assert/strict';
import {setProductRoutes,productPath,idForSlug,slugify} from './plant-routes.js';
import {createPageHandler} from './product-page-source.mjs';
import {productMeta} from './seo.mjs';
import {savedRoutes} from './plant-route-names.js';
test('existing URLs remain stable after display-name edits and duplicate names stay distinct',()=>{
 const id=Object.keys(savedRoutes)[0];setProductRoutes([{id,name:'Renamed plant'},{id:'new-a',name:'Test Hoya'},{id:'new-b',name:'Test Hoya'}]);
 assert.equal(productPath({name:'Renamed plant'},id),'/plants/'+encodeURIComponent(savedRoutes[id]));
 assert.equal(idForSlug('test-hoya'),'new-a');assert.equal(idForSlug('test-hoya--new-b'),'new-b');
 assert.equal(slugify(' Hoya <Princess> / Splash! '),'hoya-princess-splash');
});
test('named route renders initial HTML, metadata and offers; legacy redirects preserve language',async()=>{
 const p={name:'Test Hoya',published:true,variants:[{price:25000,available:1}]};
 const h=createPageHandler('<head></head><div id="product-view" hidden></div>',async()=>p,async()=>[{id:'new-a',name:p.name}]);
 const r=await h({httpMethod:'GET',path:'/plants/test-hoya',queryStringParameters:{lang:'en'}});
 assert.equal(r.statusCode,200);assert.match(r.body,/data-server-product="new-a"/);assert.match(r.body,/https:\/\/temoplants.com\/plants\/test-hoya/);
 assert.equal(productMeta(p,'new-a').data.offers[0].url,'https://temoplants.com/plants/test-hoya');
 const old=await h({httpMethod:'GET',path:'/shop.html',queryStringParameters:{product:'new-a',lang:'en'}});assert.equal(old.statusCode,301);assert.equal(old.headers.Location,'/plants/test-hoya?lang=en');
 assert.equal((await h({httpMethod:'GET',path:'/plants/no-such-plant'})).statusCode,404);
 assert.equal((await h({httpMethod:'GET',path:'/plants/test-hoya/'})).headers.Location,'/plants/test-hoya');
});
