import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('src/main/resources/static/vendor', { recursive: true });
copyFileSync('node_modules/jquery/dist/jquery.min.js', 'src/main/resources/static/vendor/jquery.min.js');
