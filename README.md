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
   - script scan logs
   - raw marker search logs
   - `client-bootstrap` parse/walk logs

### Quick expected signals

- `Status: Success (200)` (or another HTTP status)
- `client-bootstrap script found: yes`
- `client-bootstrap JSON parse: success`
- one or more `Node ... path=...` entries showing promising message-like nodes
