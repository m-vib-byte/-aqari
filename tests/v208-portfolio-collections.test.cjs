'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const root=path.resolve(__dirname,'..');

test('V208 aggregates portfolio collections only from the secure V206.2 rent office API',()=>{
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const portfolio=fs.readFileSync(path.join(root,'v208-portfolio-collections.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'v208-portfolio-collections.css'),'utf8');
  const office=fs.readFileSync(path.join(root,'v206-rent-ledger.js'),'utf8');
  const propertyOS=fs.readFileSync(path.join(root,'v202-property-os.js'),'utf8');
  const shell=fs.readFileSync(path.join(root,'v205-simplified-shell.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

  assert.match(propertyOS,/rentOfficeData:function\(name,period\)/);
  assert.match(propertyOS,/totalRent:numberFrom\(model\.totals\.due\)/);
  assert.match(propertyOS,/totalCollected:numberFrom\(model\.totals\.paid\)/);
  assert.match(propertyOS,/totalBalance:numberFrom\(model\.totals\.balance\)/);
  assert.match(propertyOS,/canRecordPayment:rentWriteAllowed\(\)&&!protectedPropertyActive\(property\)/);
  assert.match(office,/AQARI_V202\?\.rentOfficeData/);
  assert.match(office,/canRecordPayment:Boolean\(data\?\.canRecordPayment\)/);

  assert.match(shell,/\['collectionProPage','collectionProPage','التحصيل'\]/);
  assert.match(html,/id=["']collectionProPage["']/);

  assert.match(loader,/function installV208PortfolioCollections\s*\(/);
  assert.match(loader,/portfolioCss\.href='\/v208-portfolio-collections\.css'/);
  assert.match(loader,/portfolioJs\.src='\/v208-portfolio-collections\.js'/);
  assert.match(loader,/script\.addEventListener\('load', installV208PortfolioCollections, \{ once:true \}\)/);
  assert.ok(loader.indexOf("script.src='/v206-rent-ledger.js'")<loader.indexOf("script.addEventListener('load', installV208PortfolioCollections"));

  assert.match(portfolio,/AQARI_V202\?\.rentOfficeData/);
  assert.match(portfolio,/rentOfficeData\(name,period\)/);
  assert.match(portfolio,/String\(data\.period\|\|''\)===period/);
  assert.match(portfolio,/data\.totalRent/);
  assert.match(portfolio,/data\.totalCollected/);
  assert.match(portfolio,/data\.totalBalance/);
  assert.match(portfolio,/data\.canRecordPayment/);
  assert.match(portfolio,/function collectionRate\s*\(/);
  assert.match(portfolio,/function prioritySort\s*\(/);
  assert.match(portfolio,/data-v208-filter="action"/);
  assert.match(portfolio,/data-v208-filter="due"/);
  assert.match(portfolio,/data-v208-filter="settled"/);
  assert.match(portfolio,/data-v208-filter="setup"/);
  assert.match(portfolio,/data-v208-filter="all"/);
  assert.match(portfolio,/id="v208PortfolioPeriod"/);
  assert.match(portfolio,/type="month"/);
  assert.match(portfolio,/data-v208-search/);
  assert.match(portfolio,/data-v208-open/);
  assert.match(portfolio,/data-v208-statement/);
  assert.match(portfolio,/v202TabCollections/);
  assert.match(portfolio,/data-v202-action="statement"/);
  assert.match(portfolio,/v202StatementPeriod/);
  assert.match(portfolio,/id="v208PortfolioCollections"/);
  assert.match(portfolio,/id="v208HomeCollections"/);
  assert.match(portfolio,/window\.go\?\.\('collectionProPage'\)/);
  assert.match(portfolio,/AQARI_SUPABASE\?\.context/);
  assert.match(portfolio,/membership\?\.is_active/);
  assert.match(portfolio,/عرض فقط/);
  assert.match(portfolio,/لوحة التحصيل الشاملة/);

  assert.doesNotMatch(portfolio,/rentLedgerV202/);
  assert.doesNotMatch(portfolio,/contractsV202/);
  assert.doesNotMatch(portfolio,/propertyContext/);
  assert.doesNotMatch(portfolio,/localStorage/);
  assert.doesNotMatch(portfolio,/sessionStorage/);
  assert.doesNotMatch(portfolio,/AQARI_SUPABASE\s*=/);

  assert.match(css,/v208-board/);
  assert.match(css,/v208-period/);
  assert.match(css,/v208-home-card/);
  assert.match(css,/v208-state\.is-due/);
  assert.match(css,/v208-kpis \.is-collected/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media print\{body\.aq-v208 \.v208-board,body\.aq-v208 \.v208-home-card\{display:none!important\}\}/);
});
