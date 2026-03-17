# chatgpt-markdown-exporter

## Test the Firefox extension (debug MVP)

1. Open Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `manifest.json` from this repository.
5. Click the extension icon to open the popup.
6. In the popup:
   - Paste a ChatGPT shared URL (example: `https://chatgpt.com/s/xxxxx`) into the input.
   - Click **Load Page**.
7. Verify debug output appears in the popup textarea:
   - fetch status
   - HTML length
   - React Router enqueue extraction logs for script `#7`
   - decoded payload parse status
   - resolved message candidate logs (id/role/create_time/content_type/parts)

### Quick expected signals

- `Status: Success (200)` (or another HTTP status)
- `script #7 found: yes`
- `script #7 decoded JSON parse: success`
- `Resolved message count: ...`
- one or more `Message ...` entries with role + parts preview
