import { createDebugSink } from '../platform/browser/shared/debugSink.js';
import { createFirefoxPopupHost } from '../platform/browser/firefox/firefoxPopupHost.js';
import { createChatGptProvider } from '../providers/chatgpt/chatgptProvider.js';
import { renderConversationAsDebugText } from '../renderers/debugTextRenderer.js';

export function initPopupApp() {
  const urlInput = document.getElementById('urlInput');
  const loadButton = document.getElementById('loadButton');
  const debugOutput = document.getElementById('debugOutput');
  const status = document.getElementById('status');

  const debugSink = createDebugSink(debugOutput);
  const host = createFirefoxPopupHost({
    writeDebug: (message) => debugSink.write(message),
    setStatus: (value) => { status.textContent = value; }
  });
  const provider = createChatGptProvider();

  debugSink.write('Extension started');
  debugSink.write('DOM loaded');

  loadButton.addEventListener('click', async () => {
    try {
      debugSink.write('Button clicked');
      const url = urlInput.value.trim();
      debugSink.write(`URL read: ${url}`);

      if (!url) {
        host.setStatus('Status: Error - URL is required');
        debugSink.write('ERROR: URL is required');
        return;
      }

      host.setStatus('Status: Fetching...');
      debugSink.write('Fetch started');

      const source = await host.fetchPageHtml(url);
      debugSink.write(`Fetch status: ${source.status}`);
      debugSink.write(`HTML length: ${source.html.length}`);

      if (!provider.canHandle({ url: source.url, html: source.html })) {
        throw new Error('No provider matched URL/content');
      }

      const result = provider.extractFromSource({ url: source.url, html: source.html });
      const debugText = renderConversationAsDebugText({
        prelude: result.debug.prelude,
        debug: result.debug,
        conversation: result.conversation || { messages: [] }
      });
      debugText.split('\n').forEach((line) => debugSink.write(line));

      host.setStatus(`Status: Success (${source.status})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugSink.write(`ERROR: ${message}`);
      host.setStatus(`Status: Error - ${message}`);
    }
  });
}
