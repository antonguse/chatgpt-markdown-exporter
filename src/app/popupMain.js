import { createFirefoxPopupHost } from '../platform/browser/firefox/firefoxPopupHost.js';
import { createChatGptProvider } from '../providers/chatgpt/chatgptProvider.js';
import { renderConversationAsDebugText } from '../renderers/debugTextRenderer.js';
import { renderConversationAsMarkdown } from '../renderers/markdownRenderer.js';

function getDocumentTitleFromHtml(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return (doc.title || '').trim();
  } catch {
    return '';
  }
}

export function initPopupApp() {
  const urlInput = document.getElementById('urlInput');
  const convertButton = document.getElementById('convertButton');
  const debugToggle = document.getElementById('debugToggle');
  const outputPanel = document.getElementById('outputPanel');
  const status = document.getElementById('status');

  const setStatus = (value) => {
    status.textContent = `Status: ${value}`;
  };

  const host = createFirefoxPopupHost({
    writeDebug: () => {},
    setStatus
  });
  const provider = createChatGptProvider();

  setStatus('idle');

  convertButton.addEventListener('click', async () => {
    try {
      const url = urlInput.value.trim();
      if (!url) {
        setStatus('error: URL is required');
        return;
      }

      setStatus('running');

      const source = await host.fetchPageHtml(url);
      if (!provider.canHandle({ url: source.url, html: source.html })) {
        throw new Error('No provider matched URL/content');
      }

      const result = provider.extractFromSource({ url: source.url, html: source.html });
      const conversation = result.conversation || { messages: [] };

      if (debugToggle.checked) {
        outputPanel.value = renderConversationAsDebugText({
          prelude: result.debug.prelude,
          debug: result.debug,
          conversation
        });
      } else {
        outputPanel.value = renderConversationAsMarkdown(conversation, {
          title: getDocumentTitleFromHtml(source.html),
          sourceUrl: source.url
        });
      }

      setStatus('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`error: ${message}`);
    }
  });
}
