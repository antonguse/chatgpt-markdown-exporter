/**
 * @typedef {Object} DebugData
 * @property {string} payloadShape
 * @property {number} rawCandidateCount
 * @property {number} validMessageCount
 * @property {any[]} orderedWrapperNodes
 * @property {any[]} wrapperDerivedVisibleRoleNodes
 * @property {any[]} suppressionDecisions
 * @property {any[]} terminalVisibleSelections
 * @property {any[]} exportedMessages
 * @property {string[]} prelude
 */

export function createDebugData() {
  return {
    payloadShape: 'unknown',
    rawCandidateCount: 0,
    validMessageCount: 0,
    orderedWrapperNodes: [],
    wrapperDerivedVisibleRoleNodes: [],
    suppressionDecisions: [],
    terminalVisibleSelections: [],
    exportedMessages: [],
    prelude: []
  };
}
