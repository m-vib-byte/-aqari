import {readFileSync,writeFileSync} from 'node:fs';
const file=new URL('../index.html',import.meta.url);
let html=readFileSync(file,'utf8');
if(!html.includes('id="aqHomePresentation"')){
  const css=readFileSync(new URL('../src/v267/styles/home-presentation.css',import.meta.url),'utf8');
  html=html.replace('</head>',`<style id="aqHomePresentationStyle">\n${css}\n</style>\n</head>`);
  // Install only with the complete owner presentation package, before auth executes.
  const anchor='<script defer id="aqari-v198-secure-cloud-js"';
  if(!html.includes(anchor))throw Error('HOME_PRESENTATION_AUTH_ANCHOR_MISSING');
  html=html.replace(anchor,`<section id="aqHomePresentation" aria-hidden="true"><div class="aq-home-loading-card"><strong>عقاري</strong><p role="status" aria-live="polite">جارٍ تجهيز الصفحة الرئيسية…</p><button type="button" hidden>إعادة المحاولة</button></div></section>\n<script defer src="/src/v267/home-presentation.js?release=V267"></script>\n${anchor}`);
  writeFileSync(file,html);
}
