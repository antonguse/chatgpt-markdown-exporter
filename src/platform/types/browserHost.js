/**
 * @typedef {Object} BrowserHost
 * @property {(url: string) => Promise<{status: number, url: string, html: string}>} fetchPageHtml
 * @property {(message: string) => void} writeDebug
 * @property {(statusText: string) => void} setStatus
 */

export {};
