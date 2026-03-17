import { createDebugData } from '../../../debug/debugCollector.js';
import { compactResolvedNode, isPlainObjectNode, resolveRefIndex } from './payloadParsing.js';

function toPartsArray(partsValue) {
  if (Array.isArray(partsValue)) return partsValue;
  if (partsValue === null || partsValue === undefined) return [];
  return [partsValue];
}

function extractPartsPreview(parts, limit = 80) {
  if (!Array.isArray(parts) || parts.length === 0) return '';
  const firstPart = parts.find((part) => typeof part === 'string');
  if (typeof firstPart !== 'string') return '';
  return firstPart.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeMessageCandidate(node) {
  const normalizedContent = isPlainObjectNode(node.content)
    ? { ...node.content, parts: toPartsArray(node.content.parts) }
    : { parts: [] };
  return { ...node, content: normalizedContent };
}

function isResolvedMessage(node) {
  if (!isPlainObjectNode(node)) return false;
  const hasId = typeof node.id === 'string' && node.id.length > 0;
  const hasAuthorRole = typeof node?.author?.role === 'string' && node.author.role.length > 0;
  const hasCreateTime = typeof node.create_time === 'number';
  const hasPartsField = node?.content && Object.prototype.hasOwnProperty.call(node.content, 'parts');
  return hasId && hasAuthorRole && hasCreateTime && hasPartsField;
}

function sortMessages(messages) {
  const sorted = [...messages];
  sorted.sort((a, b) => {
    const ta = typeof a.message.create_time === 'number' ? a.message.create_time : Number.POSITIVE_INFINITY;
    const tb = typeof b.message.create_time === 'number' ? b.message.create_time : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return (a.message.id || '').localeCompare(b.message.id || '');
  });
  return sorted;
}

function findMessageAnchorIndex(root) {
  for (let i = 0; i < root.length; i += 1) {
    if (root[i] === 'messages') return i;
  }
  return -1;
}

function makeMessageEntry(rootIndex, message, wrapperNode = null) {
  return { rootIndex, message: normalizeMessageCandidate(message), wrapperNode };
}

function extractSingleResponseCandidates(root, anchorIndex) {
  const rawCandidates = [];
  const nextIndex = anchorIndex + 1;
  if (nextIndex < root.length) {
    const resolvedNext = resolveRefIndex(nextIndex, root, 0, new Set());
    if (Array.isArray(resolvedNext)) resolvedNext.forEach((item) => rawCandidates.push({ rootIndex: nextIndex, candidate: item }));
    else rawCandidates.push({ rootIndex: nextIndex, candidate: resolvedNext });
  }

  return {
    shape: 'single-response-direct-message',
    rawCandidateCount: rawCandidates.length,
    validMessages: rawCandidates.filter((entry) => isResolvedMessage(entry.candidate)).map((entry) => makeMessageEntry(entry.rootIndex, entry.candidate)),
    wrapperNodes: []
  };
}

function isConversationNode(node) {
  return isPlainObjectNode(node) && isPlainObjectNode(node.message)
    && (Object.prototype.hasOwnProperty.call(node, 'parent') || Array.isArray(node.children));
}

function extractFullThreadCandidates(root) {
  const rawCandidates = [];
  const wrapperNodes = [];
  for (let i = 0; i < root.length; i += 1) {
    const resolved = resolveRefIndex(i, root, 0, new Set());
    if (isConversationNode(resolved)) {
      const wrapperNode = {
        id: typeof resolved.id === 'string' ? resolved.id : null,
        parentId: typeof resolved.parent === 'string' ? resolved.parent : null,
        childrenIds: Array.isArray(resolved.children) ? resolved.children.filter((child) => typeof child === 'string') : [],
        message: resolved.message
      };
      wrapperNodes.push(wrapperNode);
      rawCandidates.push({ rootIndex: i, candidate: resolved.message, wrapperNode: { id: wrapperNode.id, parentId: wrapperNode.parentId } });
    }
  }

  return {
    shape: 'full-thread-node-map',
    rawCandidateCount: rawCandidates.length,
    validMessages: rawCandidates.filter((entry) => isResolvedMessage(entry.candidate)).map((entry) => makeMessageEntry(entry.rootIndex, entry.candidate, entry.wrapperNode || null)),
    wrapperNodes
  };
}

function dedupeAndSortMessages(messageEntries) {
  const deduped = [];
  const seenIds = new Set();
  messageEntries.forEach((entry) => {
    if (!seenIds.has(entry.message.id)) {
      seenIds.add(entry.message.id);
      deduped.push(entry);
    }
  });
  return sortMessages(deduped);
}

function orderFullThreadMessagesByGraph(messages, wrapperNodes = []) {
  const messageByWrapperId = new Map();
  messages.forEach((entry) => {
    const wrapperId = entry?.wrapperNode?.id;
    if (typeof wrapperId === 'string' && wrapperId.length > 0) messageByWrapperId.set(wrapperId, entry);
  });
  if (wrapperNodes.length === 0 || messageByWrapperId.size === 0) return { orderedMessages: sortMessages(messages), orderedWrapperNodes: [] };

  const wrapperById = new Map();
  wrapperNodes.forEach((node) => { if (typeof node?.id === 'string' && node.id.length > 0) wrapperById.set(node.id, node); });
  const childrenByParent = new Map();
  wrapperById.forEach((node) => {
    const parentId = node?.parentId;
    if (typeof parentId === 'string' && wrapperById.has(parentId)) {
      const siblings = childrenByParent.get(parentId) || [];
      siblings.push(node);
      childrenByParent.set(parentId, siblings);
    }
  });
  wrapperById.forEach((node) => {
    node.childrenIds.forEach((childId) => {
      if (wrapperById.has(childId)) {
        const siblings = childrenByParent.get(node.id) || [];
        if (!siblings.some((sibling) => sibling.id === childId)) siblings.push(wrapperById.get(childId));
        childrenByParent.set(node.id, siblings);
      }
    });
  });

  const compareNodes = (a, b) => {
    const ta = typeof a?.message?.create_time === 'number' ? a.message.create_time : Number.POSITIVE_INFINITY;
    const tb = typeof b?.message?.create_time === 'number' ? b.message.create_time : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    const ia = typeof a?.message?.id === 'string' ? a.message.id : '';
    const ib = typeof b?.message?.id === 'string' ? b.message.id : '';
    if (ia !== ib) return ia.localeCompare(ib);
    return (a.id || '').localeCompare(b.id || '');
  };

  const roots = [];
  wrapperById.forEach((node) => {
    const parentId = node?.parentId;
    if (!(typeof parentId === 'string' && wrapperById.has(parentId))) roots.push(node);
  });
  roots.sort(compareNodes);
  childrenByParent.forEach((siblings) => siblings.sort(compareNodes));

  const orderedWrapperNodes = [];
  const orderedMessages = [];
  const visitedWrapperIds = new Set();
  function walk(node) {
    const wrapperId = node?.id;
    if (!wrapperId || visitedWrapperIds.has(wrapperId)) return;
    visitedWrapperIds.add(wrapperId);
    orderedWrapperNodes.push(node);
    const messageEntry = messageByWrapperId.get(wrapperId);
    if (messageEntry) orderedMessages.push(messageEntry);
    const children = childrenByParent.get(wrapperId) || [];
    children.forEach((childNode) => walk(childNode));
  }
  roots.forEach((rootNode) => walk(rootNode));
  wrapperById.forEach((node) => { if (!visitedWrapperIds.has(node.id)) walk(node); });

  const leftoverMessages = messages.filter((entry) => {
    const wrapperId = entry?.wrapperNode?.id;
    return !(typeof wrapperId === 'string' && orderedMessages.some((orderedEntry) => orderedEntry?.wrapperNode?.id === wrapperId));
  }).sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));

  return { orderedMessages: [...orderedMessages, ...leftoverMessages], orderedWrapperNodes };
}

function isDescendantWrapper(wrapperId, possibleAncestorId, parentByWrapperId) {
  if (typeof wrapperId !== 'string' || typeof possibleAncestorId !== 'string') return false;
  let current = parentByWrapperId.get(wrapperId);
  const guard = new Set();
  while (typeof current === 'string' && !guard.has(current)) {
    if (current === possibleAncestorId) return true;
    guard.add(current);
    current = parentByWrapperId.get(current);
  }
  return false;
}

function selectTerminalVisibleMessages(orderedMessages, orderedWrapperNodes = []) {
  const parentByWrapperId = new Map();
  orderedWrapperNodes.forEach((node) => {
    if (typeof node?.id === 'string') parentByWrapperId.set(node.id, typeof node?.parentId === 'string' ? node.parentId : null);
  });
  orderedMessages.forEach((entry) => {
    const wrapperId = entry?.wrapperNode?.id;
    if (typeof wrapperId === 'string' && !parentByWrapperId.has(wrapperId)) parentByWrapperId.set(wrapperId, entry?.wrapperNode?.parentId || null);
  });

  const wrapperVisibleEntries = [];
  let segmentIndex = -1;
  let previousVisibleRole = null;
  orderedWrapperNodes.forEach((node) => {
    const role = node?.message?.author?.role;
    if (!(role === 'user' || role === 'assistant')) return;
    if (role !== previousVisibleRole) { segmentIndex += 1; previousVisibleRole = role; }
    wrapperVisibleEntries.push({ wrapperNode: node, role, segmentIndex });
  });

  const visibleBySegment = new Map();
  wrapperVisibleEntries.forEach((item) => {
    const list = visibleBySegment.get(item.segmentIndex) || [];
    list.push(item);
    visibleBySegment.set(item.segmentIndex, list);
  });

  const keptVisibleWrapperIds = new Set();
  const suppressed = [];
  visibleBySegment.forEach((segmentItems, currentSegmentIndex) => {
    segmentItems.forEach((item, itemIndex) => {
      const currentWrapperId = item?.wrapperNode?.id;
      let keptDescendantWrapperId = null;
      for (let j = itemIndex + 1; j < segmentItems.length; j += 1) {
        const candidateWrapperId = segmentItems[j]?.wrapperNode?.id;
        if (isDescendantWrapper(candidateWrapperId, currentWrapperId, parentByWrapperId)) keptDescendantWrapperId = candidateWrapperId;
      }
      if (keptDescendantWrapperId) {
        suppressed.push({ wrapperNode: item.wrapperNode, segmentIndex: currentSegmentIndex, keptDescendantWrapperId });
        return;
      }
      if (typeof currentWrapperId === 'string') keptVisibleWrapperIds.add(currentWrapperId);
    });
  });

  const selectedMessages = [];
  orderedMessages.forEach((entry) => {
    const role = entry?.message?.author?.role;
    if (!(role === 'user' || role === 'assistant')) { selectedMessages.push(entry); return; }
    const wrapperId = entry?.wrapperNode?.id;
    if (typeof wrapperId === 'string' && keptVisibleWrapperIds.has(wrapperId)) selectedMessages.push(entry);
  });

  const keptVisibleDebug = wrapperVisibleEntries.map((item) => ({
    wrapperNode: item.wrapperNode,
    segmentIndex: item.segmentIndex,
    terminalVisible: typeof item?.wrapperNode?.id === 'string' && keptVisibleWrapperIds.has(item.wrapperNode.id)
  }));

  return { selectedMessages, suppressedIntermediateMessages: suppressed, wrapperDerivedVisibleRoleNodes: wrapperVisibleEntries, keptVisibleDebug };
}

function toCanonicalMessage(entry, isTerminalVisible) {
  const message = entry.message;
  return {
    message_id: message.id,
    wrapper_node_id: entry?.wrapperNode?.id || null,
    parent_wrapper_node_id: entry?.wrapperNode?.parentId || null,
    role: message?.author?.role || 'unknown',
    create_time: typeof message.create_time === 'number' ? message.create_time : null,
    parts: toPartsArray(message?.content?.parts),
    content_type: typeof message?.content?.content_type === 'string' ? message.content.content_type : null,
    terminal_visible: typeof isTerminalVisible === 'boolean' ? isTerminalVisible : null,
    metadata: {}
  };
}

export function extractChatGptConversation(root, sourceUrl) {
  const debug = createDebugData();
  const anchorIndex = findMessageAnchorIndex(root);
  const scanResult = anchorIndex !== -1 ? extractSingleResponseCandidates(root, anchorIndex) : extractFullThreadCandidates(root);
  const dedupedMessages = dedupeAndSortMessages(scanResult.validMessages);
  const fullThreadOrder = scanResult.shape === 'full-thread-node-map'
    ? orderFullThreadMessagesByGraph(dedupedMessages, scanResult.wrapperNodes || [])
    : { orderedMessages: dedupedMessages, orderedWrapperNodes: [] };

  const terminalSelection = scanResult.shape === 'full-thread-node-map'
    ? selectTerminalVisibleMessages(fullThreadOrder.orderedMessages, fullThreadOrder.orderedWrapperNodes)
    : { selectedMessages: fullThreadOrder.orderedMessages, suppressedIntermediateMessages: [], wrapperDerivedVisibleRoleNodes: [], keptVisibleDebug: [] };

  const exportedMessages = terminalSelection.selectedMessages.filter((entry) => entry?.message?.author?.role !== 'system');

  debug.payloadShape = scanResult.shape;
  debug.rawCandidateCount = scanResult.rawCandidateCount;
  debug.validMessageCount = scanResult.validMessages.length;
  debug.orderedWrapperNodes = fullThreadOrder.orderedWrapperNodes;
  debug.wrapperDerivedVisibleRoleNodes = terminalSelection.wrapperDerivedVisibleRoleNodes;
  debug.suppressionDecisions = terminalSelection.suppressedIntermediateMessages;
  debug.terminalVisibleSelections = terminalSelection.keptVisibleDebug;
  debug.exportedMessages = exportedMessages;

  const terminalByWrapperId = new Map();
  terminalSelection.keptVisibleDebug.forEach((entry) => {
    if (entry?.wrapperNode?.id) terminalByWrapperId.set(entry.wrapperNode.id, entry.terminalVisible);
  });

  return {
    conversation: {
      provider_id: 'chatgpt',
      source_url: sourceUrl,
      conversation_id: null,
      shape: scanResult.shape,
      messages: exportedMessages.map((entry) => toCanonicalMessage(entry, terminalByWrapperId.get(entry?.wrapperNode?.id)))
    },
    debug,
    rootInfo: { anchorIndex }
  };
}

export function logRootDebugLines(root) {
  return [45, 58, 61].flatMap((index) => {
    if (index < 0 || index >= root.length) return [`root[${index}] raw: (out of range)`];
    const raw = `root[${index}] raw: ${compactResolvedNode(root[index])}`;
    const resolved = `root[${index}] resolved: ${compactResolvedNode(resolveRefIndex(index, root, 0, new Set()))}`;
    return [raw, resolved];
  });
}

export { findMessageAnchorIndex, toPartsArray, extractPartsPreview, compactResolvedNode };
