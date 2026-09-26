import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
const description = 'منصة عقاري لإدارة الأملاك، دخول المستأجرين، ومتابعة الشركاء في الكويت.';

test('public entry documents allow indexing and publish the Arabic description', () => {
  for (const path of ['index.html', 'login.html']) {
    const html = read(path);
    assert.match(html, new RegExp(`<meta name="description" content="${description}">`));
    assert.match(html, /<meta name="robots" content="index, follow">/);
    assert.doesNotMatch(html, /<meta name="robots" content="noindex,nofollow">/);
  }
  assert.equal(read('robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://myaqari.com/sitemap.xml\n');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/myaqari\.com\/<\/loc>/);
});

function relativeLuminance(hex) {
  const channels = hex.match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('light-theme gold tokens use a WCAG AA-compliant dark shade', () => {
  assert.match(read('v267-unified.css'), /--aq-gold:#74511c;--aq-gold-strong:#5d4013;/);
  assert.match(read('login.html'), /--gold:#74511c;/);
  assert.ok(contrast('74511c', 'ffffff') >= 4.5);
  assert.ok(contrast('5d4013', 'ffffff') >= 4.5);
});

test('supplemental operational UI waits until the page is idle', () => {
  const html = read('index.html');
  assert.match(html, /<script defer src="\/noncritical-ui-loader\.js"><\/script>/);
  for (const source of ['safe-autosync-ui.js', 'production-status.js', 'pre-migration-backup.js', 'final-release-ui.js']) {
    assert.doesNotMatch(html, new RegExp(`<script defer src="\\/${source}"><\\/script>`));
  }
  const loader = read('noncritical-ui-loader.js');
  assert.match(loader, /requestIdleCallback/);
  assert.match(loader, /window\.addEventListener\('load', schedule/);
});
