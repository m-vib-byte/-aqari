import assert from 'node:assert/strict';

// These checks belong to the verified synthetic workspace flow. A signed-out
// Preview must not load the optional modules needed to render these controls.
export async function checkV267AuthenticatedPresentation(page, { populated = false } = {}) {
  const desktop = page.viewportSize();
  try {
    await page.setViewportSize({ width:390, height:844 });
    await page.evaluate(() => window.go('home'));
    await page.waitForSelector('#v205SimpleHome[data-authenticated="true"]', { timeout:18000 });
    await page.waitForSelector('#v210DailyCommandCenter', { timeout:18000 });
    await page.waitForFunction(() => [
      'aqari-v267-premium-workspace-css', 'aqari-v206-integrated-ledger-css',
      'aqari-v209-global-search-css', 'aqari-v210-daily-command-center-css'
    ].every(id => Boolean(document.getElementById(id)?.sheet)));

    const presentation = await page.evaluate(() => ({
      release:document.querySelector('meta[name="aqari-release"]')?.content,
      contract:document.querySelector('meta[name="aqari-api-contract"]')?.content,
      design:document.querySelector('meta[name="aqari-design"]')?.content,
      title:document.title,
      classes:['aq-v200','aq-v201','aq-v202','aq-v203','aq-v205','aq-v208','aq-v209','aq-v210','aq-v267'].every(name => document.body.classList.contains(name)),
      propertyReady:document.body.getAttribute('data-v202-ready'),
      propertyVersion:window.AQARI_V202?.version,
      homeReady:document.body.getAttribute('data-v205-ready'),
      homeVersion:window.AQARI_V205?.version,
      searchVersion:window.AQARI_V209?.version,
      searchRevision:window.AQARI_V209?.revision,
      searchMeta:document.querySelector('meta[name="aqari-global-search"]')?.content,
      commandVersion:window.AQARI_V210?.version,
      commandMeta:document.querySelector('meta[name="aqari-daily-command-center"]')?.content,
      overview:document.querySelector('#v205SimpleHome h1')?.textContent.trim(),
      commandTitle:document.getElementById('v210Title')?.textContent.trim(),
      periodLabel:document.querySelector('label[for="v210Period"]')?.textContent.trim(),
      periodType:document.getElementById('v210Period')?.type,
      shell:Boolean(document.getElementById('aqariV199Topbar')),
      dashboard:Boolean(document.querySelector('#v205LegacyDashboardSlot #aqariV199Dashboard')),
      propertyActions:document.querySelectorAll('#v201PropertyCenter [data-v201-property-action]').length,
      mobileCreateHidden:!document.getElementById('v201MobileCreate')?.getClientRects().length,
      businessLinks:Array.from(document.querySelectorAll('#v199MoreMenu [data-v199-go]'), node => node.getAttribute('data-v199-go')),
      fakeBars:document.querySelectorAll('#aqariV199Dashboard .v199-mini-bars').length,
      overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    }));
    assert.equal(presentation.release, 'V267');
    assert.equal(presentation.contract, 'V198');
    assert.match(presentation.title, /V267/);
    assert.equal(presentation.design, 'V206-preview');
    assert.ok(presentation.classes && presentation.shell && presentation.dashboard, 'authenticated presentation layers must be available');
    assert.equal(presentation.propertyReady, 'true');
    assert.equal(presentation.propertyVersion, 'V206-preview');
    assert.equal(presentation.homeReady, 'true');
    assert.equal(presentation.homeVersion, 'V205-preview');
    assert.equal(presentation.searchVersion, 'V209-global-search');
    assert.equal(presentation.searchRevision, 'V209.1-self-heal');
    assert.equal(presentation.searchMeta, presentation.searchVersion);
    assert.equal(presentation.commandVersion, 'V210-daily-command-center');
    assert.equal(presentation.commandMeta, presentation.commandVersion);
    // V267 uses an overview with explicitly monthly collection figures. The old
    // signed-out check's priority-before-KPI layout no longer describes this UI.
    assert.equal(presentation.overview, 'لوحة المدير العام');
    assert.equal(presentation.commandTitle, 'التحصيل والمتابعة');
    assert.equal(presentation.periodLabel, 'شهر التحصيل');
    assert.equal(presentation.periodType, 'month');
    assert.equal(presentation.propertyActions, 4);
    assert.ok(presentation.mobileCreateHidden, 'home must not expose a duplicate floating create button');
    for (const route of ['tenants','reports','documentsHub']) assert.ok(presentation.businessLinks.includes(route), route+' missing from More menu');
    assert.equal(presentation.fakeBars, 0, 'dashboard must not render fabricated chart bars');
    assert.equal(presentation.overflow, false, 'authenticated home must fit 390px');

    const navigation = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('#v205PrimarySections [data-v205-section]'), node => ({
        key:node.getAttribute('data-v205-section'), route:node.getAttribute('data-v199-go'),
        label:node.textContent.trim(), current:node.getAttribute('aria-current')
      }));
      return {
        lang:document.documentElement.lang, dir:document.documentElement.dir,
        direction:getComputedStyle(document.getElementById('v205SimpleHome')).direction,
        label:document.getElementById('v205PrimarySections')?.getAttribute('aria-label'),
        inPageHidden:document.getElementById('v205PrimarySections')?.hidden,
        desktopVisible:Boolean(document.querySelector('.v199-primary-nav')?.getClientRects().length),
        mobileRole:document.querySelector('.mobilebar')?.getAttribute('role'),
        mobileLabel:document.querySelector('.mobilebar')?.getAttribute('aria-label'),
        sections,
        mobile:Array.from(document.querySelectorAll('.mobilebar .v199-bottom-button'), node => {
          const rect=node.getBoundingClientRect();
          return { key:node.getAttribute('data-v199-go')||node.getAttribute('data-v199-action'), label:node.textContent.trim(), width:rect.width, height:rect.height, visible:Boolean(node.getClientRects().length) };
        })
      };
    });
    assert.equal(navigation.lang, 'ar');
    assert.equal(navigation.dir, 'rtl');
    assert.equal(navigation.direction, 'rtl');
    assert.ok(navigation.label && navigation.inPageHidden && !navigation.desktopVisible, 'mobile must have one labelled navigation surface');
    const expectedSections = [
      ['home','الرئيسية'], ['properties','العقارات'], ['tenants','المستأجرون'],
      ['collectionProPage','التحصيل'], ['maintenanceProPage','الصيانة']
    ];
    assert.deepEqual(navigation.sections.map(item => [item.key,item.route]), expectedSections.map(([key]) => [key,key]));
    expectedSections.forEach(([,label], index) => assert.ok(navigation.sections[index].label.includes(label)));
    assert.equal(navigation.sections.filter(item => item.current === 'page').length, 1);
    assert.equal(navigation.sections.find(item => item.current === 'page')?.key, 'home');
    assert.equal(navigation.mobileRole, 'navigation');
    assert.ok(navigation.mobileLabel);
    assert.deepEqual(navigation.mobile.map(item => item.key), ['home','properties','collectionProPage','maintenanceProPage','more']);
    assert.ok(navigation.mobile.every(item => item.visible && item.label && item.width >= 44 && item.height >= 44), 'five visible mobile touch targets must be at least 44px');

    await page.locator('#v205SimpleHome [data-v205-command="search"]').click();
    await page.waitForSelector('#v199SearchPanel.on', { state:'visible' });
    const search = await page.evaluate(() => {
      const panel=document.getElementById('v199SearchPanel'), input=document.getElementById('v199SearchInput');
      const rect=panel.getBoundingClientRect();
      return {
        role:panel.getAttribute('role'), dir:panel.getAttribute('dir'),
        inputFont:parseFloat(getComputedStyle(input).fontSize),
        monthFont:parseFloat(getComputedStyle(document.getElementById('v209SearchPeriod')).fontSize),
        results:Boolean(document.getElementById('v209SearchResults')),
        left:rect.left, right:rect.right, viewport:document.documentElement.clientWidth,
        overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });
    assert.equal(search.role, 'search');
    assert.equal(search.dir, 'rtl');
    assert.ok(search.results && search.inputFont >= 16 && search.monthFont >= 16, 'search controls must remain readable without iPhone zoom');
    assert.ok(search.left >= 0 && search.right <= search.viewport + 1 && !search.overflow, 'search panel must fit the mobile viewport');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#v199SearchPanel.on', { state:'hidden' });

    const daily = await page.locator('#v205DailyActions [data-v205-daily-action]').evaluateAll(nodes => nodes.map(node => {
      const rect=node.getBoundingClientRect();
      return { key:node.getAttribute('data-v205-daily-action'), route:node.getAttribute('data-v199-go'), label:node.textContent.trim(), disabled:node.disabled, width:rect.width, height:rect.height };
    }));
    assert.deepEqual(daily.map(item => [item.key,item.route]), [
      ['contract','smartContractsPage'], ['payment','collectionProPage'], ['statement','properties'], ['maintenance','maintenanceProPage']
    ]);
    assert.ok(daily.every(item => item.label && !item.disabled && item.width >= 44 && item.height >= 44), 'daily actions must be labelled, enabled touch targets');
    for (const action of ['contract','payment','statement']) {
      await page.locator('#v205DailyActions [data-v205-daily-action="'+action+'"]').click();
      await page.waitForSelector('#v205PropertyChooser.on [role="dialog"][aria-modal="true"]', { state:'visible' });
      const options = await page.locator('#v205ChooserList [data-v205-property-index] strong').allTextContents();
      assert.deepEqual(options, populated ? ['Synthetic Tower'] : [], 'property selection must use only this synthetic workspace');
      if (!populated) assert.ok(await page.locator('#v205ChooserList .v205-chooser-empty').isVisible());
      await page.keyboard.press('Escape');
      await page.waitForSelector('#v205PropertyChooser.on', { state:'hidden' });
    }

    await page.locator('#v205SimpleHome [data-v205-command="quick"]').click();
    await page.waitForSelector('#v201CreateMenu.on [role="dialog"][aria-modal="true"]', { state:'visible' });
    assert.deepEqual(await page.locator('#v201CreateMenu [data-v201-create]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-v201-create'))), ['collections','tenants','maintenance','properties']);
    await page.waitForFunction(() => document.activeElement?.matches('#v201CreateMenu [data-v201-create="collections"]'));
    const stableFocus = await page.evaluate(async () => {
      const focused=document.activeElement;
      let blurred=false;
      const noteBlur=() => { blurred=true; };
      focused.addEventListener('blur', noteBlur);
      // Re-run the real enhancement scheduler; previously it re-appended every
      // option on each pass, detaching the focused node and dropping focus.
      for (let pass=0;pass<3;pass++) {
        window.AQARI_V205.refresh();
        await new Promise(resolve => setTimeout(resolve, 140));
      }
      focused.removeEventListener('blur', noteBlur);
      return !blurred && focused.isConnected && document.activeElement === focused;
    });
    assert.ok(stableFocus, 'quick-create focus must survive repeated presentation refreshes');
    await page.locator('#v201CreateMenu [data-v201-create="properties"]').click();
    await page.waitForSelector('#modal.on[role="dialog"][aria-modal="true"]', { state:'visible' });
    await page.waitForFunction(() => {
      const controls=Array.from(document.querySelectorAll('#fields input,#fields select,#fields textarea'));
      return controls.length > 0 && controls.every(control => Array.from(control.labels || []).some(label => label.textContent.trim()));
    });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#modal.on', { state:'hidden' });
    await page.evaluate(() => window.go('home'));
  } finally {
    if (desktop) await page.setViewportSize(desktop);
  }
}
