console.log("Extension started");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded");

  const urlInput = document.getElementById("urlInput");
  const loadButton = document.getElementById("loadButton");
  const debugOutput = document.getElementById("debugOutput");
  const status = document.getElementById("status");

  const MAX_DEPTH = 60;

  function log(message) {
    console.log(message);
    debugOutput.value += `${message}\n`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function normalizeSentinel(value) {
    if (typeof value === "number" && value < 0) {
      return null;
    }
    return value;
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

  function isLikelyRefObject(obj) {
    if (!isPlainObject(obj)) {
      return false;
    }

    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return false;
    }

    return keys.every((key) => /^_\d+$/.test(key));
  }

  function resolveRefIndex(index, root, depth = 0, seen = new Set()) {
    if (!Number.isInteger(index) || index < 0 || index >= root.length) {
      return normalizeSentinel(index);
    }

    if (depth > MAX_DEPTH) {
      return `[max-depth-ref:${index}]`;
    }

    const token = `ref:${index}`;
    if (seen.has(token)) {
      return `[cycle-ref:${index}]`;
    }

    seen.add(token);
    const resolved = resolveValue(root[index], root, depth + 1, seen);
    seen.delete(token);
    return resolved;
  }

  function looksLikeReferenceArray(items) {
    return Array.isArray(items) && items.every((item) => Number.isInteger(item));
  }

  function resolveKeyedRefObject(obj, root, depth, seen) {
    const entries = Object.keys(obj)
      .map((key) => ({
        key,
        keyIndex: Number.parseInt(key.slice(1), 10),
        valueRef: obj[key]
      }))
      .sort((a, b) => a.keyIndex - b.keyIndex);

    const output = {};

    entries.forEach((entry) => {
      const propertyNameCandidate = resolveRefIndex(entry.keyIndex, root, depth + 1, seen);
      const propertyName = typeof propertyNameCandidate === "string" && propertyNameCandidate
        ? propertyNameCandidate
        : `_key_${entry.keyIndex}`;

      let propertyValue;
      if (typeof entry.valueRef === "number") {
        if (entry.valueRef >= 0 && Number.isInteger(entry.valueRef)) {
          propertyValue = resolveRefIndex(entry.valueRef, root, depth + 1, seen);
        } else {
          propertyValue = normalizeSentinel(entry.valueRef);
        }
      } else {
        propertyValue = resolveValue(entry.valueRef, root, depth + 1, seen);
      }

      output[propertyName] = propertyValue;
    });

    return output;
  }

  function resolveValue(node, root, depth = 0, seen = new Set()) {
    if (depth > MAX_DEPTH) {
      return "[max-depth-node]";
    }

    if (node === null || node === undefined) {
      return node;
    }

    if (typeof node === "number") {
      return normalizeSentinel(node);
    }

    if (typeof node === "string" || typeof node === "boolean") {
      return node;
    }

    if (Array.isArray(node)) {
      if (looksLikeReferenceArray(node)) {
        return node.map((item) => {
          if (item >= 0) {
            return resolveRefIndex(item, root, depth + 1, seen);
          }
          return normalizeSentinel(item);
        });
      }

      return node.map((item) => resolveValue(item, root, depth + 1, seen));
    }

    if (isLikelyRefObject(node)) {
      return resolveKeyedRefObject(node, root, depth + 1, seen);
    }

    if (isPlainObject(node)) {
      const resolved = {};
      Object.entries(node).forEach(([key, value]) => {
        resolved[key] = resolveValue(value, root, depth + 1, seen);
      });
      return resolved;
    }

    return node;
  }

  function compactResolvedNode(node) {
    if (!isPlainObject(node)) {
      try {
        return JSON.stringify(node).slice(0, 240);
      } catch {
        return String(node);
      }
    }

    const parts = Object.entries(node).map(([key, value]) => {
      let compact;
      if (typeof value === "string") {
        compact = value.slice(0, 80).replace(/\s+/g, " ");
      } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
        compact = String(value);
      } else if (Array.isArray(value)) {
        compact = `Array(len=${value.length})`;
      } else if (isPlainObject(value)) {
        compact = `Object(keys=${Object.keys(value).slice(0, 10).join(",")})`;
      } else {
        compact = typeof value;
      }
      return `${key}=${compact}`;
    });

    return parts.join(" | ");
  }

  function toPartsArray(partsValue) {
    if (Array.isArray(partsValue)) {
      return partsValue;
    }

    if (partsValue === null || partsValue === undefined) {
      return [];
    }

    return [partsValue];
  }

  function extractPartsPreview(parts, limit = 80) {
    if (!Array.isArray(parts) || parts.length === 0) {
      return "";
    }

    const firstPart = parts.find((part) => typeof part === "string");
    if (typeof firstPart !== "string") {
      return "";
    }

    return firstPart.replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function normalizeMessageCandidate(node) {
    const normalizedContent = isPlainObject(node.content)
      ? { ...node.content, parts: toPartsArray(node.content.parts) }
      : { parts: [] };

    return {
      ...node,
      content: normalizedContent
    };
  }

  function isResolvedMessage(node) {
    if (!isPlainObject(node)) {
      return false;
    }

    const hasId = typeof node.id === "string" && node.id.length > 0;
    const hasAuthorRole = typeof node?.author?.role === "string" && node.author.role.length > 0;
    const hasCreateTime = typeof node.create_time === "number";
    const hasPartsField = node?.content && Object.prototype.hasOwnProperty.call(node.content, "parts");

    return hasId && hasAuthorRole && hasCreateTime && hasPartsField;
  }

  function sortMessages(messages) {
    const sorted = [...messages];
    sorted.sort((a, b) => {
      const ta = typeof a.message.create_time === "number" ? a.message.create_time : Number.POSITIVE_INFINITY;
      const tb = typeof b.message.create_time === "number" ? b.message.create_time : Number.POSITIVE_INFINITY;

      if (ta !== tb) {
        return ta - tb;
      }

      const ia = typeof a.message.id === "string" ? a.message.id : "";
      const ib = typeof b.message.id === "string" ? b.message.id : "";
      return ia.localeCompare(ib);
    });
    return sorted;
  }

  function findMessageAnchorIndex(root) {
    for (let i = 0; i < root.length; i += 1) {
      if (root[i] === "messages") {
        return i;
      }
    }
    return -1;
  }

  function makeMessageEntry(rootIndex, message, wrapperNode = null) {
    return {
      rootIndex,
      message: normalizeMessageCandidate(message),
      wrapperNode
    };
  }

  function extractSingleResponseCandidates(root, anchorIndex) {
    const rawCandidates = [];

    const nextIndex = anchorIndex + 1;
    if (nextIndex < root.length) {
      const resolvedNext = resolveRefIndex(nextIndex, root, 0, new Set());

      if (Array.isArray(resolvedNext)) {
        resolvedNext.forEach((item) => rawCandidates.push({ rootIndex: nextIndex, candidate: item }));
      } else {
        rawCandidates.push({ rootIndex: nextIndex, candidate: resolvedNext });
      }
    }

    const validMessages = rawCandidates
      .filter((entry) => isResolvedMessage(entry.candidate))
      .map((entry) => makeMessageEntry(entry.rootIndex, entry.candidate));

    return {
      shape: "single-response-direct-message",
      rawCandidateCount: rawCandidates.length,
      validMessages
    };
  }

  function isConversationNode(node) {
    if (!isPlainObject(node)) {
      return false;
    }

    if (!isPlainObject(node.message)) {
      return false;
    }

    return Object.prototype.hasOwnProperty.call(node, "parent") || Array.isArray(node.children);
  }

  function extractFullThreadCandidates(root) {
    const rawCandidates = [];
    const wrapperNodes = [];

    for (let i = 0; i < root.length; i += 1) {
      const resolved = resolveRefIndex(i, root, 0, new Set());

      if (isConversationNode(resolved)) {
        const wrapperNode = {
          id: typeof resolved.id === "string" ? resolved.id : null,
          parentId: typeof resolved.parent === "string" ? resolved.parent : null,
          childrenIds: Array.isArray(resolved.children)
            ? resolved.children.filter((child) => typeof child === "string")
            : [],
          message: resolved.message
        };

        wrapperNodes.push(wrapperNode);

        rawCandidates.push({
          rootIndex: i,
          candidate: resolved.message,
          wrapperNode: {
            id: wrapperNode.id,
            parentId: wrapperNode.parentId
          }
        });
      }
    }

    const validMessages = rawCandidates
      .filter((entry) => isResolvedMessage(entry.candidate))
      .map((entry) => makeMessageEntry(entry.rootIndex, entry.candidate, entry.wrapperNode || null));

    return {
      shape: "full-thread-node-map",
      rawCandidateCount: rawCandidates.length,
      validMessages,
      wrapperNodes
    };
  }


  function orderFullThreadMessagesByGraph(messages, wrapperNodes = []) {
    const messageByWrapperId = new Map();

    messages.forEach((entry) => {
      const wrapperId = entry?.wrapperNode?.id;
      if (typeof wrapperId === "string" && wrapperId.length > 0) {
        messageByWrapperId.set(wrapperId, entry);
      }
    });

    if (wrapperNodes.length === 0 || messageByWrapperId.size === 0) {
      return {
        orderedMessages: sortMessages(messages),
        orderedWrapperNodes: []
      };
    }

    const wrapperById = new Map();
    wrapperNodes.forEach((node) => {
      if (typeof node?.id === "string" && node.id.length > 0) {
        wrapperById.set(node.id, node);
      }
    });

    const childrenByParent = new Map();

    wrapperById.forEach((node) => {
      const parentId = node?.parentId;
      if (typeof parentId === "string" && wrapperById.has(parentId)) {
        const siblings = childrenByParent.get(parentId) || [];
        siblings.push(node);
        childrenByParent.set(parentId, siblings);
      }
    });

    wrapperById.forEach((node) => {
      node.childrenIds.forEach((childId) => {
        if (wrapperById.has(childId)) {
          const siblings = childrenByParent.get(node.id) || [];
          if (!siblings.some((sibling) => sibling.id === childId)) {
            siblings.push(wrapperById.get(childId));
            childrenByParent.set(node.id, siblings);
          }
        }
      });
    });

    const compareNodes = (a, b) => {
      const ta = typeof a?.message?.create_time === "number" ? a.message.create_time : Number.POSITIVE_INFINITY;
      const tb = typeof b?.message?.create_time === "number" ? b.message.create_time : Number.POSITIVE_INFINITY;
      if (ta !== tb) {
        return ta - tb;
      }
      const ia = typeof a?.message?.id === "string" ? a.message.id : "";
      const ib = typeof b?.message?.id === "string" ? b.message.id : "";
      if (ia !== ib) {
        return ia.localeCompare(ib);
      }
      return (a.id || "").localeCompare(b.id || "");
    };

    const compareEntries = (a, b) => {
      const ta = typeof a.message.create_time === "number" ? a.message.create_time : Number.POSITIVE_INFINITY;
      const tb = typeof b.message.create_time === "number" ? b.message.create_time : Number.POSITIVE_INFINITY;
      if (ta !== tb) {
        return ta - tb;
      }
      return (a.message.id || "").localeCompare(b.message.id || "");
    };

    const roots = [];
    wrapperById.forEach((node) => {
      const parentId = node?.parentId;
      if (!(typeof parentId === "string" && wrapperById.has(parentId))) {
        roots.push(node);
      }
    });

    roots.sort(compareNodes);
    childrenByParent.forEach((siblings) => siblings.sort(compareNodes));

    const orderedWrapperNodes = [];
    const orderedMessages = [];
    const visitedWrapperIds = new Set();

    function walk(node) {
      const wrapperId = node?.id;
      if (!wrapperId || visitedWrapperIds.has(wrapperId)) {
        return;
      }
      visitedWrapperIds.add(wrapperId);
      orderedWrapperNodes.push(node);

      const messageEntry = messageByWrapperId.get(wrapperId);
      if (messageEntry) {
        orderedMessages.push(messageEntry);
      }

      const children = childrenByParent.get(wrapperId) || [];
      children.forEach((childNode) => walk(childNode));
    }

    roots.forEach((rootNode) => walk(rootNode));

    const leftoverWrapperNodes = [];
    wrapperById.forEach((node) => {
      if (!visitedWrapperIds.has(node.id)) {
        leftoverWrapperNodes.push(node);
      }
    });
    leftoverWrapperNodes.sort(compareNodes).forEach((node) => walk(node));

    const leftoverMessages = messages
      .filter((entry) => {
        const wrapperId = entry?.wrapperNode?.id;
        return !(typeof wrapperId === "string" && orderedMessages.some((orderedEntry) => orderedEntry?.wrapperNode?.id === wrapperId));
      })
      .sort(compareEntries);

    return {
      orderedMessages: [...orderedMessages, ...leftoverMessages],
      orderedWrapperNodes
    };
  }

  function dedupeAndSortMessages(messageEntries) {
    const deduped = [];
    const seenIds = new Set();

    messageEntries.forEach((entry) => {
      const messageId = entry.message.id;
      if (!seenIds.has(messageId)) {
        seenIds.add(messageId);
        deduped.push(entry);
      }
    });

    return sortMessages(deduped);
  }

  function filterExportedNonSystemMessages(messages) {
    return messages.filter((entry) => entry?.message?.author?.role !== "system");
  }


  function isDescendantWrapper(wrapperId, possibleAncestorId, parentByWrapperId) {
    if (typeof wrapperId !== "string" || typeof possibleAncestorId !== "string") {
      return false;
    }

    let current = parentByWrapperId.get(wrapperId);
    const guard = new Set();

    while (typeof current === "string" && !guard.has(current)) {
      if (current === possibleAncestorId) {
        return true;
      }
      guard.add(current);
      current = parentByWrapperId.get(current);
    }

    return false;
  }

  function selectTerminalVisibleMessages(orderedMessages, orderedWrapperNodes = []) {
    const parentByWrapperId = new Map();

    orderedWrapperNodes.forEach((node) => {
      if (typeof node?.id === "string") {
        parentByWrapperId.set(node.id, typeof node?.parentId === "string" ? node.parentId : null);
      }
    });

    orderedMessages.forEach((entry) => {
      const wrapperId = entry?.wrapperNode?.id;
      const parentId = entry?.wrapperNode?.parentId;
      if (typeof wrapperId === "string" && !parentByWrapperId.has(wrapperId)) {
        parentByWrapperId.set(wrapperId, typeof parentId === "string" ? parentId : null);
      }
    });

    const wrapperVisibleEntries = [];
    let segmentIndex = -1;
    let previousVisibleRole = null;

    orderedWrapperNodes.forEach((node) => {
      const role = node?.message?.author?.role;
      const isVisibleRole = role === "user" || role === "assistant";
      if (!isVisibleRole) {
        return;
      }

      if (role !== previousVisibleRole) {
        segmentIndex += 1;
        previousVisibleRole = role;
      }

      wrapperVisibleEntries.push({
        wrapperNode: node,
        role,
        segmentIndex
      });
    });

    const visibleBySegment = new Map();
    wrapperVisibleEntries.forEach((item) => {
      const segmentItems = visibleBySegment.get(item.segmentIndex) || [];
      segmentItems.push(item);
      visibleBySegment.set(item.segmentIndex, segmentItems);
    });

    const keptVisibleWrapperIds = new Set();
    const suppressed = [];

    visibleBySegment.forEach((segmentItems, currentSegmentIndex) => {
      segmentItems.forEach((item, itemIndex) => {
        const currentWrapperId = item?.wrapperNode?.id;

        let keptDescendantWrapperId = null;

        for (let j = itemIndex + 1; j < segmentItems.length; j += 1) {
          const candidateWrapperId = segmentItems[j]?.wrapperNode?.id;

          if (isDescendantWrapper(candidateWrapperId, currentWrapperId, parentByWrapperId)) {
            keptDescendantWrapperId = candidateWrapperId;
          }
        }

        if (keptDescendantWrapperId) {
          suppressed.push({
            wrapperNode: item.wrapperNode,
            segmentIndex: currentSegmentIndex,
            keptDescendantWrapperId
          });
          return;
        }

        if (typeof currentWrapperId === "string") {
          keptVisibleWrapperIds.add(currentWrapperId);
        }
      });
    });

    const selected = [];

    orderedMessages.forEach((entry) => {
      const role = entry?.message?.author?.role;
      const isVisibleRole = role === "user" || role === "assistant";
      if (!isVisibleRole) {
        selected.push(entry);
        return;
      }

      const wrapperId = entry?.wrapperNode?.id;
      if (typeof wrapperId === "string" && keptVisibleWrapperIds.has(wrapperId)) {
        selected.push(entry);
      }
    });

    const keptVisibleDebug = [];
    wrapperVisibleEntries.forEach((item) => {
      const wrapperId = item?.wrapperNode?.id;
      keptVisibleDebug.push({
        wrapperNode: item.wrapperNode,
        segmentIndex: item.segmentIndex,
        terminalVisible: typeof wrapperId === "string" && keptVisibleWrapperIds.has(wrapperId)
      });
    });

    return {
      selectedMessages: selected,
      suppressedIntermediateMessages: suppressed,
      wrapperDerivedVisibleRoleNodes: wrapperVisibleEntries,
      keptVisibleDebug
    };
  }

  function extractMessagesByPayloadShape(root, anchorIndex) {
    const scanResult = anchorIndex !== -1
      ? extractSingleResponseCandidates(root, anchorIndex)
      : extractFullThreadCandidates(root);

    const dedupedMessages = dedupeAndSortMessages(scanResult.validMessages);
    const fullThreadOrder = scanResult.shape === "full-thread-node-map"
      ? orderFullThreadMessagesByGraph(dedupedMessages, scanResult.wrapperNodes || [])
      : { orderedMessages: dedupedMessages, orderedWrapperNodes: [] };
    const terminalSelection = scanResult.shape === "full-thread-node-map"
      ? selectTerminalVisibleMessages(fullThreadOrder.orderedMessages, fullThreadOrder.orderedWrapperNodes)
      : {
        selectedMessages: fullThreadOrder.orderedMessages,
        suppressedIntermediateMessages: [],
        wrapperDerivedVisibleRoleNodes: [],
        keptVisibleDebug: []
      };
    const exportedMessages = filterExportedNonSystemMessages(terminalSelection.selectedMessages);

    return {
      shape: scanResult.shape,
      rawCandidateCount: scanResult.rawCandidateCount,
      validMessageCount: scanResult.validMessages.length,
      dedupedMessages,
      exportedMessages,
      orderedWrapperNodes: fullThreadOrder.orderedWrapperNodes,
      suppressedIntermediateMessages: terminalSelection.suppressedIntermediateMessages,
      wrapperDerivedVisibleRoleNodes: terminalSelection.wrapperDerivedVisibleRoleNodes,
      keptVisibleDebug: terminalSelection.keptVisibleDebug
    };
  }

  function logRootDebug(root) {
    [45, 58, 61].forEach((index) => {
      if (index < 0 || index >= root.length) {
        log(`root[${index}] raw: (out of range)`);
        return;
      }

      log(`root[${index}] raw: ${compactResolvedNode(root[index])}`);
      const resolved = resolveRefIndex(index, root, 0, new Set());
      log(`root[${index}] resolved: ${compactResolvedNode(resolved)}`);
    });
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

    log(`script #7 root type: array`);
    log(`script #7 root array length: ${root.length}`);

    const anchor = findMessageAnchorIndex(root);
    if (anchor === -1) {
      log('Found "messages": no');
    } else {
      log(`Found "messages" at root index ${anchor}`);
      const start = Math.max(40, 0);
      const end = Math.min(70, root.length - 1);

      for (let i = start; i <= end; i += 1) {
        const value = root[i];
        const type = Array.isArray(value) ? "array" : typeof value;
        const preview = compactResolvedNode(value);
        log(`root[${i}] type=${type} preview=${preview}`);
      }
    }

    logRootDebug(root);

    const extraction = extractMessagesByPayloadShape(root, anchor);
    const messages = extraction.exportedMessages;

    log(`payload shape classification: ${extraction.shape}`);
    log(`raw candidates found: ${extraction.rawCandidateCount}`);
    log(`valid messages found: ${extraction.validMessageCount}`);
    log(`exported non-system messages: ${messages.length}`);

    if (extraction.shape === "full-thread-node-map") {
      extraction.wrapperDerivedVisibleRoleNodes.slice(0, 20).forEach((item, index) => {
        const node = item.wrapperNode;
        const createTime = typeof node?.message?.create_time === "number" ? node.message.create_time : "(none)";
        log(
          `Wrapper-visible ${index + 1}: wrapper_node_id=${node?.id || "(none)"}, role=${item.role}, parent_wrapper_id=${node?.parentId || "(none)"}, create_time=${createTime}`
        );
      });

      extraction.suppressedIntermediateMessages.forEach((item) => {
        const node = item.wrapperNode;
        log(
          `Suppressed: wrapper_node_id=${node?.id || "(none)"}, role=${node?.message?.author?.role || "(none)"}, segment_index=${item.segmentIndex}, nearest_kept_descendant_wrapper_node_id=${item.keptDescendantWrapperId || "(none)"}, reason=suppressed_intermediate_variant`
        );
      });

      extraction.keptVisibleDebug.slice(0, 10).forEach((item, index) => {
        const node = item.wrapperNode;
        log(
          `Kept ${index + 1}: wrapper_node_id=${node?.id || "(none)"}, role=${node?.message?.author?.role || "(none)"}, parent_wrapper_id=${node?.parentId || "(none)"}, terminal_visible=${item.terminalVisible}`
        );
      });
    }

    if (extraction.shape === "full-thread-node-map") {
      extraction.orderedWrapperNodes.slice(0, 15).forEach((node, index) => {
        const role = node?.message?.author?.role || "(none)";
        const messageId = node?.message?.id || "(none)";
        const createTime = typeof node?.message?.create_time === "number" ? node.message.create_time : "(none)";
        log(
          `Ordered wrapper ${index + 1}: wrapper_node_id=${node?.id || "(none)"}, parent_wrapper_id=${node?.parentId || "(none)"}, role=${role}, message_id=${messageId}, create_time=${createTime}`
        );
      });
    }

    messages.slice(0, 10).forEach((entry, index) => {
      const message = entry.message;
      const parts = toPartsArray(message?.content?.parts);
      const firstPartPreview = extractPartsPreview(parts, 80) || "(no-text-part)";

      log(
        `Message ${index + 1}: root_index=${entry.rootIndex}, id=${message.id}, role=${message?.author?.role}, create_time=${message.create_time}, parts_is_array=${Array.isArray(parts)}, parts_len=${parts.length}, first_part=${firstPartPreview}`
      );
    });

    if (extraction.shape === "full-thread-node-map") {
      messages.slice(0, 15).forEach((entry, index) => {
        const message = entry.message;
        const parts = toPartsArray(message?.content?.parts);
        const firstPartPreview = extractPartsPreview(parts, 60) || "(no-text-part)";

        log(
          `Exported ${index + 1}: role=${message?.author?.role}, message_id=${message.id}, create_time=${message.create_time}, first_part=${firstPartPreview}`
        );
      });
    }

    log("Final message list:");
    messages.forEach((entry, index) => {
      const message = entry.message;
      const parts = toPartsArray(message?.content?.parts);
      log(
        `#${index + 1} id=${message.id} | role=${message?.author?.role} | create_time=${message.create_time} | parts=${JSON.stringify(parts)}`
      );
    });
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
