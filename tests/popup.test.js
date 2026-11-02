import test from 'node:test';
import assert from 'node:assert/strict';
import { initPopupApp } from '../src/app/popupMain.js';

function setup(t, { clipboard } = {}) {
  const originals = Object.fromEntries(['document', 'navigator', 'fetch', 'DOMParser'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const ids = ['urlInput', 'convertButton', 'copyButton', 'debugToggle', 'markdownMode', 'markdownOutput', 'debugOutput', 'status'];
  const elements = Object.fromEntries(ids.map(id => [id, { value: '', hidden: false, checked: false, disabled: false, handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } }]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: id => elements[id] } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard } });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  initPopupApp();
  return elements;
}

test('opening popup never accesses clipboard, even when API is missing', t => {
  const ui = setup(t);
  assert.equal(ui.status.textContent, 'Status: idle');
  assert.equal(ui.urlInput.value, '');
});

test('opening popup cannot read clipboard or overwrite manual input', async t => {
  let reads = 0;
  const ui = setup(t, { clipboard: { readText() { reads++; throw new Error('must not read'); } } });
  ui.urlInput.value = 'https://chatgpt.com/share/manual';
  await Promise.resolve();
  assert.equal(reads, 0);
  assert.equal(ui.urlInput.value, 'https://chatgpt.com/share/manual');
});

test('invalid manual URL is rejected before fetch', async t => {
  const ui = setup(t);
  let requests = 0;
  globalThis.fetch = async () => { requests++; };
  ui.urlInput.value = 'https://evil.example/';
  await ui.convertButton.handlers.click();
  assert.equal(requests, 0);
  assert.match(ui.status.textContent, /error:/);
});

test('in-flight conversion blocks duplicate conversion and Copy; HTTP failure is visible', async t => {
  const ui = setup(t);
  let resolve;
  let requests = 0;
  globalThis.fetch = () => { requests++; return new Promise(r => { resolve = r; }); };
  ui.urlInput.value = 'https://chatgpt.com/share/example';
  const conversion = ui.convertButton.handlers.click();
  assert.equal(ui.convertButton.disabled, true);
  assert.equal(ui.copyButton.disabled, true);
  await ui.convertButton.handlers.click();
  assert.equal(requests, 1);
  resolve({ ok: false, status: 403 });
  await conversion;
  assert.equal(ui.status.textContent, 'Status: error: HTTP 403');
  assert.equal(ui.convertButton.disabled, false);
  assert.equal(ui.copyButton.disabled, false);
});

test('HTML without conversation does not become success', async t => {
  const ui = setup(t);
  globalThis.fetch = async () => ({ ok: true, status: 200, url: 'https://chatgpt.com/share/example', text: async () => '<html></html>' });
  globalThis.DOMParser = class { parseFromString() { return { title: '', querySelectorAll: () => [] }; } };
  ui.urlInput.value = 'https://chatgpt.com/share/example';
  await ui.convertButton.handlers.click();
  assert.equal(ui.status.textContent, 'Status: error: No conversation messages extracted');
});

test('Copy writes only on click; denied access is visible', async t => {
  let writes = 0;
  const ui = setup(t, { clipboard: { async writeText(text) { writes++; assert.equal(text, '# Export'); throw new Error('denied'); } } });
  assert.equal(writes, 0);
  ui.markdownOutput.value = '# Export';
  await ui.copyButton.handlers.click();
  assert.equal(writes, 1);
  assert.equal(ui.status.textContent, 'Status: error: denied');
});

test('Copy succeeds for the visible Markdown and Debug panels', async t => {
  const copied = [];
  const ui = setup(t, { clipboard: { async writeText(text) { copied.push(text); } } });
  ui.markdownOutput.value = '# Export';
  ui.debugOutput.value = 'diagnostics';
  await ui.copyButton.handlers.click();
  assert.equal(ui.status.textContent, 'Status: copied');
  ui.debugToggle.checked = true;
  ui.debugToggle.handlers.change();
  await ui.copyButton.handlers.click();
  assert.deepEqual(copied, ['# Export', 'diagnostics']);
});

test('failed new conversion clears stale output', async t => {
  const ui = setup(t);
  ui.markdownOutput.value = 'old export';
  ui.debugOutput.value = 'old diagnostics';
  ui.urlInput.value = 'invalid';
  await ui.convertButton.handlers.click();
  assert.equal(ui.markdownOutput.value, '');
  assert.equal(ui.debugOutput.value, '');
});
