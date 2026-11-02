import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSupportedChatGptUrl } from '../src/providers/chatgpt/supportedUrl.js';
import { createFirefoxPopupHost } from '../src/platform/browser/firefox/firefoxPopupHost.js';
import { createChatGptProvider } from '../src/providers/chatgpt/chatgptProvider.js';

for (const value of ['https://chatgpt.com/s/abc', ' https://chatgpt.com/share/abc-123/?x=1#fragment ', 'https://CHATGPT.com:443/share/abc']) {
  test(`accept shared link: ${value}`, () => assert.equal(parseSupportedChatGptUrl(value).hostname, 'chatgpt.com'));
}
for (const value of ['', 'text', 'http://chatgpt.com/share/a', 'https://chatgpt.com.evil.example/share/a', 'https://sub.chatgpt.com/share/a', 'https://chatgpt.com@evil.example/share/a', 'https://user:pass@chatgpt.com/share/a', 'https://chatgpt.com:8443/share/a', 'https://chatgpt.com/', 'https://chatgpt.com/c/abc', 'https://chatgpt.com/share/', 'https://chatgpt.com/share/a/b', 'javascript:alert(1)']) {
  test(`reject unsupported link: ${value}`, () => {
    assert.throws(() => parseSupportedChatGptUrl(value));
    assert.equal(createChatGptProvider().canHandle({ url: value }), false);
  });
}
const host = createFirefoxPopupHost({ writeDebug() {}, setStatus() {} });

test('host independently validates input before fetch', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; });
  await assert.rejects(host.fetchPageHtml('https://evil.example/'));
  assert.equal(requests, 0);
});

test('host rejects redirects and returns actual response URL', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://chatgpt.com/s/a');
    assert.equal(options.redirect, 'error');
    return { ok: true, status: 200, url: 'https://chatgpt.com/s/a', text: async () => '<html/>' };
  });
  assert.deepEqual(await host.fetchPageHtml('https://chatgpt.com/s/a'), { status: 200, url: 'https://chatgpt.com/s/a', html: '<html/>' });
});

for (const status of [403, 404, 500]) {
  test(`HTTP ${status} cannot reach parsing`, async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status, text() { assert.fail('must not parse HTTP error'); } }));
    await assert.rejects(host.fetchPageHtml('https://chatgpt.com/s/a'), new RegExp(`HTTP ${status}`));
  });
}

test('unexpected final origin is rejected', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, url: 'https://evil.example/', text() { assert.fail('must not parse foreign HTML'); } }));
  await assert.rejects(host.fetchPageHtml('https://chatgpt.com/s/a'));
});

test('network or redirect failure propagates', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(host.fetchPageHtml('https://chatgpt.com/s/a'), /fetch failed/);
});

test('manifest retains narrowly scoped host access without clipboard permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ['https://chatgpt.com/*']);
  assert.deepEqual(manifest.permissions ?? [], []);
  assert.deepEqual(manifest.optional_permissions ?? [], []);
});
