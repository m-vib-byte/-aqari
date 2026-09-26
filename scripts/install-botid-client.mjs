import { copyFileSync, mkdirSync } from 'node:fs';

const source = new URL('../node_modules/botid/dist/client/core/index.mjs', import.meta.url);
const destination = new URL('../src/v267/vendor/botid-client.js', import.meta.url);
mkdirSync(new URL('../src/v267/vendor/', import.meta.url), { recursive:true });
copyFileSync(source, destination);
console.log('Prepared BotID browser client for protected API requests.');
