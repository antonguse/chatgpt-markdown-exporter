import { getStreamEnqueueScripts, extractEnqueuePayload, decodeEscapedPayload } from './web/pageSource.js';
import { extractChatGptConversation, findMessageAnchorIndex, compactResolvedNode, logRootDebugLines } from './extractors/conversationExtractor.js';
import { createDebugData } from '../../debug/debugCollector.js';

export function createChatGptProvider() {
  return {
    providerId: 'chatgpt',
    canHandle(source) {
      return /^https:\/\/chatgpt\.com\//.test(source.url);
    },
    extractFromSource(source) {
      const prelude = ['--- React Router enqueue extraction pass (script #7 focus) ---'];
      const parser = new DOMParser();
      const doc = parser.parseFromString(source.html, 'text/html');
      prelude.push(`Document title: ${doc.title || '(empty)'}`);

      const streamScripts = getStreamEnqueueScripts(doc);
      const scriptSeven = streamScripts.find((item) => item.index === 7);

      if (!scriptSeven) {
        prelude.push('script #7 with enqueue payload: not found');
        const debug = createDebugData();
        debug.prelude = prelude;
        return { conversation: null, debug };
      }

      prelude.push(`script #7 found: yes (textLength=${scriptSeven.scriptText.length})`);
      const payload = extractEnqueuePayload(scriptSeven.scriptText);
      if (!payload) {
        prelude.push('script #7 payload extraction: failed');
        const debug = createDebugData();
        debug.prelude = prelude;
        return { conversation: null, debug };
      }

      prelude.push(`script #7 payload extraction: success (length=${payload.length})`);
      const decoded = decodeEscapedPayload(payload, (msg) => prelude.push(msg));
      prelude.push(`script #7 decoded payload length: ${decoded.length}`);

      let root;
      try {
        root = JSON.parse(decoded);
        prelude.push('script #7 decoded JSON parse: success');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        prelude.push(`script #7 decoded JSON parse: failed (${message})`);
        const debug = createDebugData();
        debug.prelude = prelude;
        return { conversation: null, debug };
      }

      if (!Array.isArray(root)) {
        prelude.push(`script #7 root type: ${typeof root} (expected array)`);
        const debug = createDebugData();
        debug.prelude = prelude;
        return { conversation: null, debug };
      }

      prelude.push('script #7 root type: array');
      prelude.push(`script #7 root array length: ${root.length}`);

      const anchor = findMessageAnchorIndex(root);
      if (anchor === -1) prelude.push('Found "messages": no');
      else {
        prelude.push(`Found "messages" at root index ${anchor}`);
        const start = Math.max(40, 0);
        const end = Math.min(70, root.length - 1);
        for (let i = start; i <= end; i += 1) {
          const value = root[i];
          const type = Array.isArray(value) ? 'array' : typeof value;
          prelude.push(`root[${i}] type=${type} preview=${compactResolvedNode(value)}`);
        }
      }

      prelude.push(...logRootDebugLines(root));

      const result = extractChatGptConversation(root, source.url);
      result.debug.prelude = prelude;
      return result;
    }
  };
}
