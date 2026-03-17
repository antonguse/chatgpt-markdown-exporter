import { createFirefoxPopupHost } from '../platform/browser/firefox/firefoxPopupHost.js';
import { createChatGptProvider } from '../providers/chatgpt/chatgptProvider.js';
import { renderConversationAsDebugText } from '../renderers/debugTextRenderer.js';
import { buildMessageContentBlocks, renderConversationAsMarkdown } from '../renderers/markdownRenderer.js';

function getDocumentTitleFromHtml(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return (doc.title || '').trim();
  } catch {
    return '';
  }
}

function shortPreview(text, maxLen = 60) {
  return (text || '').replace(/\s+/g, ' ').slice(0, maxLen);
}

function makeFirstMessageBlockDebugLines(conversation) {
  const firstMessage = Array.isArray(conversation?.messages) ? conversation.messages[0] : null;
  if (!firstMessage) {
    return ['Block render debug: no exported messages available'];
  }

  const blocks = buildMessageContentBlocks(firstMessage.parts);
  const lines = [`Block render debug: message_id=${firstMessage.message_id}, content_blocks=${blocks.length}`];
  blocks.forEach((block, index) => {
    lines.push(
      `Block ${index + 1}: kind=${block.kind}, language=${block.language || '(none)'}, preview=${shortPreview(block.text)}`
    );
  });
  return lines;
}

function isSupportedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname === 'chatgpt.com';
  } catch {
    return false;
  }
}

async function tryAutofillUrlFromClipboard(urlInput, setStatus) {
  console.log('clipboard: read attempted');

  try {
    const raw = await navigator.clipboard.readText();
    console.log('clipboard: read succeeded');

    const text = raw.trim();
    const accepted = isSupportedUrl(text);
    console.log(`clipboard: URL ${accepted ? 'accepted' : 'rejected'}`);

    if (!accepted) {
      console.log('clipboard: input autofilled no');
      return;
    }

    urlInput.value = text;
    setStatus('Clipboard URL detected');
    console.log('clipboard: input autofilled yes');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`clipboard: read failed (${message})`);
    console.log('clipboard: input autofilled no');
  }
}

export function initPopupApp() {
  const urlInput = document.getElementById('urlInput');
  const convertButton = document.getElementById('convertButton');
  const copyButton = document.getElementById('copyButton');
  const debugToggle = document.getElementById('debugToggle');
  const markdownMode = document.getElementById('markdownMode');
  const markdownOutput = document.getElementById('markdownOutput');
  const debugOutput = document.getElementById('debugOutput');
  const status = document.getElementById('status');

  const setStatus = (value) => {
    status.textContent = `Status: ${value}`;
  };

  const setOutputMode = (isDebug) => {
    debugOutput.hidden = !isDebug;
    markdownOutput.hidden = isDebug;
  };

  const getVisibleOutputValue = () => {
    const activePanel = debugOutput.hidden ? markdownOutput : debugOutput;
    return activePanel.value || '';
  };

  const host = createFirefoxPopupHost({
    writeDebug: () => {},
    setStatus
  });
  const provider = createChatGptProvider();

  setStatus('idle');
  setOutputMode(false);
  void tryAutofillUrlFromClipboard(urlInput, setStatus);

  debugToggle.addEventListener('change', () => {
    setOutputMode(debugToggle.checked);
  });

  copyButton.addEventListener('click', async () => {
    try {
      const visibleText = getVisibleOutputValue();
      if (!visibleText.trim()) {
        setStatus('nothing to copy');
        return;
      }

      await navigator.clipboard.writeText(visibleText);
      setStatus('copied');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`error: ${message}`);
    }
  });

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

      const blockDebugLines = makeFirstMessageBlockDebugLines(conversation);
      const existingPrelude = Array.isArray(result.debug?.prelude) ? result.debug.prelude : [];
      result.debug.prelude = [...existingPrelude, ...blockDebugLines];

      debugOutput.value = renderConversationAsDebugText({
        prelude: result.debug.prelude,
        debug: result.debug,
        conversation
      });

      markdownOutput.value = renderConversationAsMarkdown(conversation, {
        title: getDocumentTitleFromHtml(source.html),
        sourceUrl: source.url,
        mode: markdownMode?.value || 'compact'
      });

      setOutputMode(debugToggle.checked);
      setStatus('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`error: ${message}`);
    }
  });
}
