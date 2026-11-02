// Shared links only. Ordinary /c/ links require a different loading strategy.
export function parseSupportedChatGptUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid ChatGPT shared URL');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' ||
      url.username || url.password || url.port ||
      !/^\/(?:s|share)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('Use https://chatgpt.com/s/<id> or https://chatgpt.com/share/<id>');
  }
  return url;
}
