# Architecture

## Platform layer
- `src/platform/types/browserHost.js` defines the browser-host interface.
- `src/platform/browser/firefox/firefoxPopupHost.js` is the Firefox adapter used now.
- `src/platform/browser/shared/*` holds browser-agnostic popup helpers.

## Provider layer
- `src/providers/common/*` defines canonical conversation/provider interfaces.
- `src/providers/chatgpt/*` contains ChatGPT-specific URL matching, page acquisition parsing, and extraction.

## Pipeline stages
1. Acquisition: browser host fetches page HTML.
2. Payload parsing: `providers/chatgpt/web/pageSource.js` and extractors decode enqueue payload.
3. Shape classification: extractor determines single-response vs full-thread.
4. Canonical extraction: extractor builds canonical conversation.
5. View selection: `src/pipeline/viewSelection.js` provides generic message views.
6. Rendering: `src/renderers/*` render canonical conversation/debug/json.

## Canonical model
Canonical types are in `src/providers/common/conversation.js` and support provider id, source URL, shape, optional conversation id, and normalized messages.

## Renderer layer
Renderers consume canonical conversation/debug data only (not raw payload internals).

## Future extension points
- Chrome/Opera can add adapters under `src/platform/browser/*` implementing `BrowserHost`.
- Claude/Gemini can add providers under `src/providers/*` implementing the provider interface.
