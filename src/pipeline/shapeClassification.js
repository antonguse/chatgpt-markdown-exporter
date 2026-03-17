export function classifyPayloadShape(anchorIndex) {
  return anchorIndex !== -1 ? 'single-response-direct-message' : 'full-thread-node-map';
}
