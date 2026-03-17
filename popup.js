console.log("Extension started");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded");

  const urlInput = document.getElementById("urlInput");
  const loadButton = document.getElementById("loadButton");
  const debugOutput = document.getElementById("debugOutput");
  const status = document.getElementById("status");

  const MAX_DEPTH = 28;
  const MAX_MESSAGES_TO_LOG = 20;

  function log(message) {
    console.log(message);
    debugOutput.value += `${message}\n`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
      const ch = scriptText[cursor];
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
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
    const resolved = resolveNode(root[index], root, depth + 1, seen);
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

    if (isPlainObject(node)) {
      const output = {};
      Object.entries(node).forEach(([rawKey, rawValue]) => {
        let key = rawKey;
        const keyRefMatch = /^_(\d+)$/.exec(rawKey);
        if (keyRefMatch) {
          const keyIndex = Number.parseInt(keyRefMatch[1], 10);
          const resolvedKey = resolveIndex(keyIndex, root, depth + 1, seen);
          if (typeof resolvedKey === "string" && resolvedKey.length > 0) {
            key = resolvedKey;
          }
        }
        output[key] = resolveNode(rawValue, root, depth + 1, seen);
      });
      return output;
    }

    return node;
  }

  function compactResolvedNode(node) {
    if (!isPlainObject(node)) {
      return String(node);
    }

    const entries = Object.entries(node).map(([key, value]) => {
      let compactValue;
      if (typeof value === "string") {
        compactValue = value.slice(0, 80).replace(/\s+/g, " ");
      } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
        compactValue = String(value);
      } else if (Array.isArray(value)) {
        compactValue = `Array(len=${value.length})`;
      } else if (isPlainObject(value)) {
        compactValue = `Object(keys=${Object.keys(value).slice(0, 8).join(",")})`;
      } else {
        compactValue = typeof value;
      }
      return `${key}=${compactValue}`;
    });

    return entries.join(" | ");
  }

  function extractPartsPreview(node, length = 120) {
    const parts = Array.isArray(node?.parts)
      ? node.parts
      : Array.isArray(node?.content?.parts)
        ? node.content.parts
        : [];

    const joined = parts
      .filter((part) => typeof part === "string")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return joined.slice(0, length);
  }

  function isResolvedMessage(node) {
    if (!isPlainObject(node)) {
      return false;
    }

    const role = node.role || node?.author?.role || node?.author?.name;
    const hasParts = Array.isArray(node?.parts) || Array.isArray(node?.content?.parts);
    const hasCreateTime = node.create_time !== undefined && node.create_time !== null;
    const hasRecipient = typeof node.recipient === "string";

    let score = 0;
    if (role) score += 1;
    if (hasParts) score += 1;
    if (hasCreateTime) score += 1;
    if (hasRecipient) score += 1;

    return score >= 3;
  }

  function sortMessages(messages) {
    const copy = [...messages];
    copy.sort((a, b) => {
      const ta = typeof a.create_time === "number" ? a.create_time : Number.POSITIVE_INFINITY;
      const tb = typeof b.create_time === "number" ? b.create_time : Number.POSITIVE_INFINITY;

      if (ta !== tb) {
        return ta - tb;
      }

      const ia = typeof a.id === "string" ? a.id : "";
      const ib = typeof b.id === "string" ? b.id : "";
      return ia.localeCompare(ib);
    });
    return copy;
  }

  function findMessageSection(root) {
    for (let i = 0; i < root.length; i += 1) {
      if (root[i] === "messages") {
        return i;
      }
    }
    return -1;
  }

  function collectMessageNodes(node, output, depth = 0, seenObjects = new WeakSet()) {
    if (depth > 10 || node === null || node === undefined) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => collectMessageNodes(item, output, depth + 1, seenObjects));
      return;
    }

    if (!isPlainObject(node)) {
      return;
    }

    if (seenObjects.has(node)) {
      return;
    }

    seenObjects.add(node);

    if (isResolvedMessage(node)) {
      output.push(node);
    }

    Object.values(node).forEach((value) => collectMessageNodes(value, output, depth + 1, seenObjects));
  }

  function findAllMessageCandidates(root) {
    const candidates = [];

    for (let i = 0; i < root.length; i += 1) {
      const resolved = resolveIndex(i, root, 0, new Set());
      collectMessageNodes(resolved, candidates, 0, new WeakSet());
    }

    const deduped = [];
    const seen = new Set();

    candidates.forEach((message) => {
      const id = typeof message.id === "string" ? message.id : null;
      const role = message.role || message?.author?.role || message?.author?.name || "";
      const createTime = message.create_time ?? "";
      const preview = extractPartsPreview(message, 60);
      const key = id || `${role}|${createTime}|${preview}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      deduped.push(message);
    });

    return sortMessages(deduped);
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

    log("script #7 root type: array");
    log(`script #7 root array length: ${root.length}`);

    const messagesAnchorIndex = findMessageSection(root);
    if (messagesAnchorIndex === -1) {
      log('Found "messages": no');
    } else {
      log(`Found "messages" at root index ${messagesAnchorIndex}`);
      const start = Math.max(40, 0);
      const end = Math.min(70, root.length - 1);

      for (let i = start; i <= end; i += 1) {
        const value = root[i];
        const type = Array.isArray(value) ? "array" : typeof value;
        const preview =
          typeof value === "string"
            ? value.slice(0, 80).replace(/\s+/g, " ")
            : JSON.stringify(value).slice(0, 120);
        log(`root[${i}] type=${type} preview=${preview}`);
      }
    }

    if (root.length > 45) {
      const resolved45 = resolveIndex(45, root, 0, new Set());
      if (isPlainObject(resolved45)) {
        log(`Resolved root[45] keys: ${Object.keys(resolved45).join(", ")}`);
        log(`Resolved root[45] compact: ${compactResolvedNode(resolved45)}`);

        [
          "parent_id",
          "children",
          "child_ids",
          "message_id",
          "next",
          "prev",
          "recipient",
          "channel",
          "token_count"
        ].forEach((key) => {
          const val = resolved45[key];
          if (val === undefined) {
            log(`Resolved root[45] ${key}: (missing)`);
          } else if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
            log(`Resolved root[45] ${key}: ${String(val)}`);
          } else if (Array.isArray(val)) {
            log(`Resolved root[45] ${key}: Array(len=${val.length})`);
          } else if (isPlainObject(val)) {
            log(`Resolved root[45] ${key}: Object(keys=${Object.keys(val).join(",")})`);
          } else {
            log(`Resolved root[45] ${key}: ${typeof val}`);
          }
        });
      } else {
        log(`Resolved root[45] type: ${Array.isArray(resolved45) ? "array" : typeof resolved45}`);
      }
    }

    const messages = findAllMessageCandidates(root);
    log(`Resolved message count: ${messages.length}`);

    messages.slice(0, MAX_MESSAGES_TO_LOG).forEach((message, index) => {
      const id = typeof message.id === "string" ? message.id : "(no-id)";
      const role = message.role || message?.author?.role || message?.author?.name || "(no-role)";
      const createTime = message.create_time ?? "(no-create_time)";
      const parts = extractPartsPreview(message, 120) || "(no-parts)";

      log(`Message ${index + 1}: id=${id}, role=${role}, create_time=${createTime}, parts=${parts}`);
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

      if (!url) {
        status.textContent = "Status: Error - URL is required";
        log("ERROR: URL is required");
        return;
      }

      status.textContent = "Status: Fetching...";
      log("Fetch started");

      const response = await fetch(url);
      log(`Fetch status: ${response.status}`);

      const html = await response.text();
      log(`HTML length: ${html.length}`);

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
