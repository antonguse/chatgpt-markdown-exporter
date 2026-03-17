const MAX_DEPTH = 60;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSentinel(value) {
  if (typeof value === 'number' && value < 0) {
    return null;
  }
  return value;
}

function isLikelyRefObject(obj) {
  if (!isPlainObject(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.every((key) => /^_\d+$/.test(key));
}

function looksLikeReferenceArray(items) {
  return Array.isArray(items) && items.every((item) => Number.isInteger(item));
}

function resolveKeyedRefObject(obj, root, depth, seen) {
  const entries = Object.keys(obj)
    .map((key) => ({ keyIndex: Number.parseInt(key.slice(1), 10), valueRef: obj[key] }))
    .sort((a, b) => a.keyIndex - b.keyIndex);

  const output = {};
  entries.forEach((entry) => {
    const propertyNameCandidate = resolveRefIndex(entry.keyIndex, root, depth + 1, seen);
    const propertyName = typeof propertyNameCandidate === 'string' && propertyNameCandidate
      ? propertyNameCandidate
      : `_key_${entry.keyIndex}`;

    let propertyValue;
    if (typeof entry.valueRef === 'number') {
      propertyValue = entry.valueRef >= 0 && Number.isInteger(entry.valueRef)
        ? resolveRefIndex(entry.valueRef, root, depth + 1, seen)
        : normalizeSentinel(entry.valueRef);
    } else {
      propertyValue = resolveValue(entry.valueRef, root, depth + 1, seen);
    }

    output[propertyName] = propertyValue;
  });

  return output;
}

export function resolveValue(node, root, depth = 0, seen = new Set()) {
  if (depth > MAX_DEPTH) return '[max-depth-node]';
  if (node === null || node === undefined) return node;
  if (typeof node === 'number') return normalizeSentinel(node);
  if (typeof node === 'string' || typeof node === 'boolean') return node;

  if (Array.isArray(node)) {
    if (looksLikeReferenceArray(node)) {
      return node.map((item) => (item >= 0 ? resolveRefIndex(item, root, depth + 1, seen) : normalizeSentinel(item)));
    }
    return node.map((item) => resolveValue(item, root, depth + 1, seen));
  }

  if (isLikelyRefObject(node)) return resolveKeyedRefObject(node, root, depth + 1, seen);

  if (isPlainObject(node)) {
    const resolved = {};
    Object.entries(node).forEach(([key, value]) => {
      resolved[key] = resolveValue(value, root, depth + 1, seen);
    });
    return resolved;
  }

  return node;
}

export function resolveRefIndex(index, root, depth = 0, seen = new Set()) {
  if (!Number.isInteger(index) || index < 0 || index >= root.length) return normalizeSentinel(index);
  if (depth > MAX_DEPTH) return `[max-depth-ref:${index}]`;
  const token = `ref:${index}`;
  if (seen.has(token)) return `[cycle-ref:${index}]`;

  seen.add(token);
  const resolved = resolveValue(root[index], root, depth + 1, seen);
  seen.delete(token);
  return resolved;
}

export function compactResolvedNode(node) {
  if (!isPlainObject(node)) {
    try {
      return JSON.stringify(node).slice(0, 240);
    } catch {
      return String(node);
    }
  }

  return Object.entries(node).map(([key, value]) => {
    let compact;
    if (typeof value === 'string') compact = value.slice(0, 80).replace(/\s+/g, ' ');
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) compact = String(value);
    else if (Array.isArray(value)) compact = `Array(len=${value.length})`;
    else if (isPlainObject(value)) compact = `Object(keys=${Object.keys(value).slice(0, 10).join(',')})`;
    else compact = typeof value;
    return `${key}=${compact}`;
  }).join(' | ');
}

export function isPlainObjectNode(value) {
  return isPlainObject(value);
}
