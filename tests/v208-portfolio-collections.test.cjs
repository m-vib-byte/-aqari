'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const root=path.resolve(__dirname,'..');

test('V208 provides a portfolio collections dashboard from the official V202 property context',()=>{
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const portfolio=fs.readFileSync(path.join(root,'v208-portfolio-collections.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'v208-portfolio-collections.css'),'utf8');
  const shell=fs.readFileSync(path.join(root,'v205-simplified-shell.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

  assert.match(shell,/\['collectionProPage','collectionProPage','التحصيل'\]/);
  assert.match(html,/id=["']collectionProPage["']/);

  assert.match(loader,/function installV208PortfolioCollections\s*\(/);
  assert.match(loader,/portfolioCss\.href='\/v208-portfolio-collections\.css'/);
  assert.match(loader,/portfolioJs\.src='\/v208-portfolio-collections\.js'/);
  assert.match(loader,/smartJs\.addEventListener\('load', installV208PortfolioCollections, \{ once:true \}\)/);

  assert.match(portfolio,/AQARI_V202\?\.propertyContext/);
  assert.match(portfolio,/AQARI_V202\?\.openProperty/);
  assert.match(portfolio,/context\.due/);
  assert.match(portfolio,/context\.contracts/);
  assert.match(portfolio,/function propertySummary\s*\(/);
  assert.match(portfolio,/function prioritySort\s*\(/);
  assert.match(portfolio,/function priority\s*\(/);
  assert.match(portfolio,/data-v208-filter="action"/);
  assert.match(portfolio,/data-v208-filter="due"/);
  assert.match(portfolio,/data-v208-filter="settled"/);
  assert.match(portfolio,/data-v208-filter="setup"/);
  assert.match(portfolio,/data-v208-filter="all"/);
  assert.match(portfolio,/data-v208-search/);
  assert.match(portfolio,/data-v208-open/);
  assert.match(portfolio,/data-v208-statement/);
  assert.match(portfolio,/v202TabCollections/);
  assert.match(portfolio,/data-v202-action="statement"/);
  assert.match(portfolio,/id="v208PortfolioCollections"/);
  assert.match(portfolio,/id="v208HomeCollections"/);
  assert.match(portfolio,/window\.go\?\.\('collectionProPage'\)/);
  assert.match(portfolio,/AQARI_SUPABASE\?\.context/);
  assert.match(portfolio,/membership\?\.is_active/);
  assert.match(portfolio,/لوحة التحصيل الشاملة/);
  assert.match(portfolio,/إجمالي المستحق الآن/);

  assert.doesNotMatch(portfolio,/rentLedgerV202/);
  assert.doesNotMatch(portfolio,/contractsV202/);
  assert.doesNotMatch(portfolio,/\.collected\b/);
  assert.doesNotMatch(portfolio,/localStorage/);
  assert.doesNotMatch(portfolio,/sessionStorage/);
  assert.doesNotMatch(portfolio,/AQARI_SUPABASE\s*=/);

  assert.match(css,/v208-board/);
  assert.match(css,/v208-home-card/);
  assert.match(css,/v208-state\.is-due/);
  assert.match(css,/v208-state\.is-settled/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media print\{body\.aq-v208 \.v208-board,body\.aq-v208 \.v208-home-card\{display:none!important\}\}/);
});
