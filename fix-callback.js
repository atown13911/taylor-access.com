const fs = require('fs');
const d = 'dist/taylor-access/browser';
let html = fs.readFileSync(d + '/index.html', 'utf8');
html = html.replace(/href="([^\/\.][^"]*\.(?:js|css))/g, 'href="/$1');
html = html.replace(/src="([^\/\.][^"]*\.js)/g, 'src="/$1');
fs.mkdirSync(d + '/callback', { recursive: true });
fs.writeFileSync(d + '/callback/index.html', html);
console.log('Fixed relative paths in callback/index.html');
