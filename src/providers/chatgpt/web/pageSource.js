export function getStreamEnqueueScripts(doc) {
  const scripts = Array.from(doc.querySelectorAll('script'));
  const marker = 'window.__reactRouterContext.streamController.enqueue(';
  return scripts
    .map((script, index) => ({ index, scriptText: script.textContent || '' }))
    .filter((item) => item.scriptText.includes(marker));
}

export function extractEnqueuePayload(scriptText) {
  const callMarker = 'window.__reactRouterContext.streamController.enqueue(';
  const callStart = scriptText.indexOf(callMarker);
  if (callStart === -1) return null;

  const payloadStart = scriptText.indexOf('"', callStart + callMarker.length);
  if (payloadStart === -1) return null;

  let escaped = false;
  let cursor = payloadStart + 1;
  while (cursor < scriptText.length) {
    const ch = scriptText[cursor];
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') return scriptText.slice(payloadStart + 1, cursor);
    cursor += 1;
  }

  return null;
}

export function decodeEscapedPayload(payload, onError) {
  try {
    return JSON.parse(`"${payload}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onError?.(`decodeEscapedPayload fallback: ${message}`);
    return payload
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
}
