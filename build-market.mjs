import {mkdir,copyFile} from 'node:fs/promises';
const files=["admin.js","unified-orders.js","assistant-domain.js","assistant-ui.js","brand-leaf.jpeg","brand-logo.jpeg","brand-pattern.jpeg","brand.css","catalog-fields.js","config.js","customer-account.js","customer-domain.js","customers.js","domain.js","favicon.svg","image-upload.js","index.html","market-domain.js","market-ui.js","marketing.css","marketing.js","migration.js","plant-hub.js","plant-workflows.js","purchase-cost.js","robots.txt","sale-catalog.js","service.js","shop-checkout.js","shop-layout.css","shop-requests.js","shop.html","shop.js","store.js","storefront-content.js","styles.css","temo-plants.html","ui.js","_headers","_redirects"];
await mkdir('dist',{recursive:true});
for(const file of files)await copyFile(file,'dist/'+file);
await mkdir('netlify/functions',{recursive:true});
await copyFile('market-function-source.mjs','netlify/functions/market-estimate.mjs');
await copyFile('shop-orders-source.mjs','netlify/functions/shop-orders.mjs');
await copyFile('assistant-source.mjs','netlify/functions/assistant.mjs');
console.log('Built static site and private market function.');
