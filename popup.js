console.log("Extension started");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded");

  const urlInput = document.getElementById("urlInput");
  const loadButton = document.getElementById("loadButton");
  const debugOutput = document.getElementById("debugOutput");
  const status = document.getElementById("status");

  const MAX_DEPTH = 25;
  const MAX_MESSAGES_TO_LOG = 20;

  function log(message) {
    console.log(message);
    debugOutput.value += `${message}\n`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
  }

  function getStreamEnqueueScripts(doc) {
    const scripts = Array.from(doc.querySelectorAll("script"));
    const marker = "window.__reactRouterContext.streamController.enqueue(";

    return scripts
      .map((script, index) => ({
        index,
        scriptText: script.textContent || ""
      }))
      .filter((item) => item.scriptText.includes(marker));
  }

  function extractEnqueuePayload(scriptText) {
    const callMarker = "window.__reactRouterContext.streamController.enqueue(";
    const callStart = scriptText.indexOf(callMarker);
    if (callStart === -1) {
      return null;
    }

    const payloadStart = scriptText.indexOf('"', callStart + callMarker.length);
    if (payloadStart === -1) {
      return null;
    }

    let escaped = false;
    let cursor = payloadStart + 1;

    while (cursor < scriptText.length) {
      const char = scriptText[cursor];

      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        return scriptText.slice(payloadStart + 1, cursor);
      }

      cursor += 1;
    }

    return null;
  }

  function decodeEscapedPayload(payload) {
    try {
      return JSON.parse(`"${payload}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`decodeEscapedPayload fallback: ${message}`);
      return payload
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }

  function resolveIndex(index, root, depth = 0, seen = new Set()) {
    if (!Number.isInteger(index) || index < 0 || index >= root.length) {
      return index;
    }

    if (depth > MAX_DEPTH) {
      return `[max-depth-index:${index}]`;
    }

    const token = `idx:${index}`;
    if (seen.has(token)) {
      return `[cycle-index:${index}]`;
    }

    seen.add(token);
    const value = root[index];
    const resolved = resolveNode(value, root, depth + 1, seen);
    seen.delete(token);

    return resolved;
  }

  function resolveNode(node, root, depth = 0, seen = new Set()) {
    if (depth > MAX_DEPTH) {
      return "[max-depth-node]";
    }

    if (node === null || node === undefined) {
      return node;
    }

    if (typeof node === "number") {
      if (Number.isInteger(node) && node >= 0 && node < root.length) {
        return resolveIndex(node, root, depth + 1, seen);
      }

      return node;
    }

    if (typeof node === "string" || typeof node === "boolean") {
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((item) => resolveNode(item, root, depth + 1, seen));
    }

    if (typeof node === "object") {
      const output = {};

      Object.entries(node).forEach(([rawKey, rawValue]) => {
        let key = rawKey;

        const keyRefMatch = /^_(\d+)$/.exec(rawKey);
        if (keyRefMatch) {
          const keyRefIndex = Number.parseInt(keyRefMatch[1], 10);
          const resolvedKey = resolveIndex(keyRefIndex, root, depth + 1, seen);
          if (typeof resolvedKey === "string" && resolvedKey) {
            key = resolvedKey;
          }
        }

        output[key] = resolveNode(rawValue, root, depth + 1, seen);
      });

      return output;
    }

    return node;
  }

  function findMessageSection(root) {
    const hits = [];

    for (let i = 0; i < root.length; i += 1) {
      if (root[i] !== "messages") {
        continue;
      }

      const around = [];
      for (let j = i + 1; j <= Math.min(i + 6, root.length - 1); j += 1) {
        const value = root[j];
        const type = Array.isArray(value) ? "array" : typeof value;
        around.push({ index: j, type, value });
      }

      hits.push({ markerIndex: i, around });
    }

    return hits;
  }

  function getMessageSummary(message) {
    const id = typeof message.id === "string" ? message.id : "(no-id)";
    const role = message.role || message?.author?.role || message?.author?.name || "(no-role)";
    const createTime = message.create_time ?? "(no-create_time)";
    const recipient = message.recipient || "(no-recipient)";
    const contentType = message.content_type || message?.content?.content_type || "(no-content_type)";

    let partsPreview = "";
    const parts = Array.isArray(message.parts) ? message.parts : Array.isArray(message?.content?.parts) ? message.content.parts : [];
    if (parts.length > 0) {
      partsPreview = parts
        .filter((part) => typeof part === "string")
        .join(" ")
        .replace(/\s+/g, " ")
        .slice(0, 180);
    }

    return { id, role, createTime, recipient, contentType, partsPreview };
  }

  function isMessageLike(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return false;
    }

    const role = record.role || record?.author?.role || record?.author?.name;
    const hasParts = Array.isArray(record.parts) || Array.isArray(record?.content?.parts);
    const hasMessageKeys = "id" in record || "content" in record || "recipient" in record;

    return Boolean(role || hasParts || hasMessageKeys);
  }

  function extractResolvedMessages(root) {
    const sections = findMessageSection(root);

    if (sections.length === 0) {
      log('Found "messages": no');
      return [];
    }

    const first = sections[0];
    log(`Found "messages" at root index ${first.markerIndex}`);

    const candidates = [];
    first.around.forEach((entry) => {
      const shortValue = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value).slice(0, 120);
      log(`messages-nearby root[${entry.index}] type=${entry.type} preview=${shortValue}`);

      if (Number.isInteger(entry.value) && entry.value >= 0 && entry.value < root.length) {
        candidates.push(entry.value);
      }

      if (Array.isArray(entry.value)) {
        entry.value.forEach((v) => {
          if (Number.isInteger(v) && v >= 0 && v < root.length) {
            candidates.push(v);
          }
        });
      }
    });

    const resolvedMessages = [];
    const visitedMessageIds = new Set();

    candidates.forEach((candidateIndex) => {
      const resolved = resolveIndex(candidateIndex, root, 0, new Set());

      if (Array.isArray(resolved)) {
        resolved.forEach((item) => {
          if (!isMessageLike(item)) {
            return;
          }

          const key = typeof item.id === "string" ? item.id : JSON.stringify(item).slice(0, 200);
          if (visitedMessageIds.has(key)) {
            return;
          }

          visitedMessageIds.add(key);
          resolvedMessages.push(item);
        });
      } else if (isMessageLike(resolved)) {
        const key = typeof resolved.id === "string" ? resolved.id : JSON.stringify(resolved).slice(0, 200);
        if (!visitedMessageIds.has(key)) {
          visitedMessageIds.add(key);
          resolvedMessages.push(resolved);
        }
      }
    });

    return resolvedMessages;
  }

  function inspectScriptSevenPayload(doc) {
    log("--- React Router enqueue extraction pass (script #7 focus) ---");

    const streamScripts = getStreamEnqueueScripts(doc);
    const scriptSeven = streamScripts.find((item) => item.index === 7);

    if (!scriptSeven) {
      log("script #7 with enqueue payload: not found");
      return;
    }

    log(`script #7 found: yes (textLength=${scriptSeven.scriptText.length})`);
    log(`script #7 preview (first 300 chars): ${scriptSeven.scriptText.slice(0, 300).replace(/\s+/g, " ")}`);

    const payload = extractEnqueuePayload(scriptSeven.scriptText);
    if (!payload) {
      log("script #7 payload extraction: failed");
      return;
    }

    log(`script #7 payload extraction: success (length=${payload.length})`);

    const decoded = decodeEscapedPayload(payload);
    log(`script #7 decoded payload length: ${decoded.length}`);
    log("script #7 decoded payload preview (first 1000 chars):");
    log(decoded.slice(0, 1000));

    let root;
    try {
      root = JSON.parse(decoded);
      log("script #7 decoded JSON parse: success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`script #7 decoded JSON parse: failed (${message})`);
      return;
    }

    if (!Array.isArray(root)) {
      log(`script #7 root type: ${typeof root} (expected array)`);
      return;
    }

    log(`script #7 root type: array`);
    log(`script #7 root array length: ${root.length}`);

    const messages = extractResolvedMessages(root);
    log(`Resolved message count: ${messages.length}`);

    if (messages.length === 0) {
      return;
    }

    messages.slice(0, MAX_MESSAGES_TO_LOG).forEach((message, index) => {
      const summary = getMessageSummary(message);
      log(
        `Message ${index + 1}: id=${summary.id}, role=${summary.role}, create_time=${summary.createTime}, recipient=${summary.recipient}, content_type=${summary.contentType}`
      );
      if (summary.partsPreview) {
        log(`Message ${index + 1} parts: ${summary.partsPreview}`);
      }
    });

    if (messages.length > MAX_MESSAGES_TO_LOG) {
      log(`...truncated ${messages.length - MAX_MESSAGES_TO_LOG} additional messages`);
    }
  }

  log("Extension started");
  log("DOM loaded");

  loadButton.addEventListener("click", async () => {
    try {
      log("Button clicked");

      const url = urlInput.value.trim();
      log(`URL read: ${url}`);
      log(`URL: ${url}`);

      if (!url) {
        status.textContent = "Status: Error - URL is required";
        log("ERROR: URL is required");
        return;
      }

      status.textContent = "Status: Fetching...";
      log("Fetch started");
      log("Fetching page...");

      const response = await fetch(url);
      log(`Fetch status: ${response.status}`);
      log(`Status: ${response.status}`);

      const html = await response.text();
      log(`HTML length: ${html.length}`);

      log("HTML preview (first 1000 chars):");
      log(html.slice(0, 1000));

      log("Parsing HTML with DOMParser...");
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      log(`Document title: ${doc.title || "(empty)"}`);

      inspectScriptSevenPayload(doc);

      status.textContent = `Status: Success (${response.status})`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`ERROR: ${message}`);
      status.textContent = `Status: Error - ${message}`;
    }
  });
});
