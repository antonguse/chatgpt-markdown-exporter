/**
 * @typedef {Object} CanonicalMessage
 * @property {string} message_id
 * @property {string | null} wrapper_node_id
 * @property {string | null} parent_wrapper_node_id
 * @property {string} role
 * @property {number | null} create_time
 * @property {any[]} parts
 * @property {string | null} content_type
 * @property {boolean | null} terminal_visible
 * @property {Record<string, any>} metadata
 */

/**
 * @typedef {Object} CanonicalConversation
 * @property {string} provider_id
 * @property {string} source_url
 * @property {string | null} conversation_id
 * @property {string} shape
 * @property {CanonicalMessage[]} messages
 */

export {};
