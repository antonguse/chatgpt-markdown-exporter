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
