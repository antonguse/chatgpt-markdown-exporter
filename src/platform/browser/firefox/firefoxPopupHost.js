import { parseSupportedChatGptUrl } from '../../../providers/chatgpt/supportedUrl.js';

/** @import { BrowserHost } from '../../types/browserHost.js' */

/**
 * @param {{ writeDebug:(msg:string)=>void, setStatus:(value:string)=>void }} deps
 * @returns {BrowserHost}
 */
export function createFirefoxPopupHost(deps) {
  return {
    async fetchPageHtml(url) {
      const validatedUrl = parseSupportedChatGptUrl(url).href;
      const response = await fetch(validatedUrl, { redirect: 'error' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const finalUrl = parseSupportedChatGptUrl(response.url).href;
      const html = await response.text();
      return {
        status: response.status,
        url: finalUrl,
        html
      };
    },
    writeDebug: deps.writeDebug,
    setStatus: deps.setStatus
  };
}

