/** @import { BrowserHost } from '../../types/browserHost.js' */

/**
 * @param {{ writeDebug:(msg:string)=>void, setStatus:(value:string)=>void }} deps
 * @returns {BrowserHost}
 */
export function createFirefoxPopupHost(deps) {
  return {
    async fetchPageHtml(url) {
      const response = await fetch(url);
      const html = await response.text();
      return {
        status: response.status,
        url,
        html
      };
    },
    writeDebug: deps.writeDebug,
    setStatus: deps.setStatus
  };
}
