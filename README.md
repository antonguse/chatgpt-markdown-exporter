# ChatGPT Markdown Exporter

Browser extension that converts ChatGPT shared conversations into clean Markdown — ready for Obsidian, Notion, or any note system.

---

## Overview

Paste a ChatGPT shared link and get a structured Markdown version of the conversation:

* Preserves message order
* Separates user and assistant clearly
* Outputs clean, readable Markdown
* Works directly in the browser — no backend required

---

## Features

* Convert ChatGPT shared links (`https://chatgpt.com/s/...`) to Markdown
* Extract conversation directly from page data (no scraping hacks)
* Clean formatting:

  * user / assistant sections
  * paragraphs
  * basic structure preserved
* Built-in debug panel (optional visibility into extraction pipeline)

---

## Example

**Input:** ChatGPT shared link
**Output:**

```markdown
## User

Create an instruction for Codex...

## Assistant

Use this prompt for Claude/Codex...
```

---

## Installation

### Firefox

1. Open Firefox
2. Navigate to:

   ```
   about:debugging#/runtime/this-firefox
   ```
3. Click **Load Temporary Add-on...**
4. Select `manifest.json` from this repository
5. Click the extension icon in the toolbar

---

### Opera (Chromium-based)

1. Open Opera
2. Go to:

   ```
   opera://extensions
   ```
3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the repository folder

---

## Usage

1. Open the extension popup
2. Paste a ChatGPT shared link:

   ```
   https://chatgpt.com/s/xxxxx
   ```
3. Click **Load Page**
4. Copy the generated Markdown from the output field

---

## How It Works

1. Fetches the shared ChatGPT page
2. Locates embedded conversation data (JSON payload)
3. Extracts message sequence:

   * role (user / assistant)
   * content (text parts)
4. Converts messages into Markdown

---

## Limitations

* Depends on ChatGPT page structure (may break if format changes)
* Advanced formatting (tables, complex code blocks) may need refinement

---

## Roadmap

* Copy-to-clipboard button
* Download `.md` file
* Improved formatting (code blocks, lists)
* Obsidian frontmatter support
* “Convert current tab” button

---

## License

MIT License



## Clipboard and URL handling

Opening the popup never reads the clipboard. Paste a link into the field with
Ctrl+V / Cmd+V or the native Paste menu, then click Convert. Copy writes the
visible output only when clicked; clipboard failures are shown in the status.
No clipboard permissions are requested. The existing ChatGPT host permission
is retained for fetching shared pages.

Accepted links are HTTPS URLs on exactly `chatgpt.com`, with no credentials or
non-default port, and a single ID under `/s/` or `/share/`. Ordinary `/c/` links
are not supported by this shared-page loader. Query strings and fragments are
preserved. All HTTP redirects are rejected, including same-origin redirects;
use the final supported shared URL instead. This intentionally avoids making a
request to an unchecked redirect destination. Whether current ChatGPT shared
links need redirects must be checked in the browser smoke test below.

HTTP failures and pages with no extracted messages are errors, not successful
empty exports. Starting a conversion clears previous output, and Convert/Copy
are disabled during the request.

## Automated regression tests

Use Node.js 20 or later, with no dependencies to install:

```sh
npm test
```

Tests cover popup initialization without clipboard access, preserved manual
input, Copy errors, URL validation before requests, duplicate conversions,
HTTP failures, redirect policy, response URL validation, missing conversation
data, and manifest permissions. These are Node tests with mocked browser APIs;
they do not establish browser permission or live ChatGPT compatibility.

## Browser smoke tests (required before release)

Run in clean Firefox and Chromium profiles; record browser version, OS, and
results. In Firefox load `manifest.json` through `about:debugging`; in Chromium
use `chrome://extensions` → Developer mode → Load unpacked.

- Open the popup with arbitrary private text in the clipboard: no read, paste
  prompt, automatic field change, or clipboard content in console logs.
- Paste through keyboard and native context menu; verify the input is preserved
  after waiting, changing focus, and toggling Debug.
- Convert a real `/s/<id>` link and a real `/share/<id>` link. Record any redirect
  failure explicitly; confirm the final supported direct URL exports expected
  messages. Do not treat merely passing URL validation as successful extraction.
- Try HTTP, lookalike hosts, credentials, non-default port, `/c/` and invalid paths:
  no network request. Check Network with popup inspection tools.
- With ChatGPT site access granted and withheld/revoked, verify success or a
  visible fetch error; never a false success. Also try offline mode.
- During a slow request, Convert and Copy stay disabled. After failure they are
  enabled, old output is absent, and the error remains visible.
- Copy Markdown and Debug output by clicking Copy, then paste into an editor.
  Verify failures remain visible if clipboard write is blocked or focus is lost.
- Close and reopen the popup during a request: new popup starts idle with no
  stale result or clipboard access. Repeat basic paste and Copy in both browsers.

Browser smoke tests have not been executed as part of the Node test suite.
