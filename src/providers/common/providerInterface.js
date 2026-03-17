/**
 * @typedef {Object} ProviderSource
 * @property {string} url
 * @property {string} html
 */

/**
 * @typedef {Object} ProviderExtractionResult
 * @property {import('./conversation.js').CanonicalConversation | null} conversation
 * @property {import('../../debug/debugCollector.js').DebugData} debug
 */

/**
 * @typedef {Object} ConversationProvider
 * @property {string} providerId
 * @property {(source: ProviderSource) => boolean} canHandle
 * @property {(source: ProviderSource, writeDebug:(msg:string)=>void) => ProviderExtractionResult} extractFromSource
 */

export {};
