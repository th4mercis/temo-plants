// Destination is rendered by our server; constrain redirects to the public store.
const destination=document.querySelector('a[href]')?.href;
if(destination){const url=new URL(destination);if(url.origin==='https://temoplants.com'&&url.pathname.startsWith('/plants/'))location.replace(url.href);}
