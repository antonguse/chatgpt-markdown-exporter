console.log("Extension started");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded");

  const urlInput = document.getElementById("urlInput");
  const loadButton = document.getElementById("loadButton");
  const debugOutput = document.getElementById("debugOutput");
  const status = document.getElementById("status");

  const DATA_MARKERS = [
    "message",
    "author",
    "recipient",
    "conversation",
    "mapping",
    "parts",
    "content",
    "shared_conversation",
    "initialState",
    "__NEXT_DATA__",
    "application/json"
  ];

  const STREAM_MARKERS = [
    "create_time",
    "update_time",
    "content_type",
    "parts",
    "author",
    "role",
    "recipient",
    "mapping",
    "message"
  ];

  function log(message) {
    console.log(message);
    debugOutput.value += `${message}\n`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
  }

  function searchRawHtml(html, marker) {
    const index = html.indexOf(marker);

    if (index === -1) {
      log(`Raw HTML marker "${marker}": NOT FOUND`);
      return;
    }

    const start = Math.max(0, index - 120);
    const end = Math.min(html.length, index + marker.length + 180);
    const nearby = html.slice(start, end).replace(/\s+/g, " ");

    log(`Raw HTML marker "${marker}": FOUND at index ${index}`);
    log(`Raw HTML nearby (first hit, ~300 chars): ${nearby}`);
  }

  function scanScripts(doc) {
    const scripts = Array.from(doc.querySelectorAll("script"));
    log(`Total <script> tags: ${scripts.length}`);

    scripts.forEach((script, index) => {
      const type = script.getAttribute("type") || "(none)";
      const text = script.textContent || "";
      const textLength = text.length;
      const preview = text.slice(0, 200).replace(/\s+/g, " ");

      log(`Script #${index}: type=${type}, textLength=${textLength}`);
      log(`Script #${index} preview (first 200 chars): ${preview}`);
    });
  }

  function getStreamEnqueueScripts(doc) {
    const scripts = Array.from(doc.querySelectorAll("script"));
    const marker = "window.__reactRouterContext.streamController.enqueue(";

    return scripts
      .map((script, index) => ({
        index,
        scriptText: script.textContent || ""
      }))
      .filter((item) => item.scriptText.includes(marker));
  }

  function extractEnqueuePayload(scriptText) {
    const callMarker = "window.__reactRouterContext.streamController.enqueue(";
    const start = scriptText.indexOf(callMarker);

    if (start === -1) {
      return null;
    }

    const payloadStart = scriptText.indexOf('"', start + callMarker.length);
    if (payloadStart === -1) {
      return null;
    }

    let escaped = false;
    let end = payloadStart + 1;

    while (end < scriptText.length) {
      const ch = scriptText[end];

      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        return scriptText.slice(payloadStart + 1, end);
      }

      end += 1;
    }

    return null;
  }

  function decodeEscapedPayload(payload) {
    try {
      return JSON.parse(`"${payload}"`);
    } catch (error) {
      log(`decodeEscapedPayload JSON.parse failed: ${error instanceof Error ? error.message : String(error)}`);
      return payload
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }

  function logMarkerHits(text, markers) {
    markers.forEach((marker) => {
      let fromIndex = 0;
      let hitCount = 0;

      while (fromIndex < text.length) {
        const hit = text.indexOf(marker, fromIndex);
        if (hit === -1) {
          break;
        }

        hitCount += 1;
        const start = Math.max(0, hit - 120);
        const end = Math.min(text.length, hit + marker.length + 180);
        const nearby = text.slice(start, end).replace(/\s+/g, " ");

        log(`Decoded marker "${marker}" hit #${hitCount} at index ${hit}`);
        log(`Decoded marker nearby (~300 chars): ${nearby}`);

        fromIndex = hit + marker.length;

        if (hitCount >= 5) {
          log(`Decoded marker "${marker}": truncated after 5 hits`);
          break;
        }
      }

      if (hitCount === 0) {
        log(`Decoded marker "${marker}": NOT FOUND`);
      }
    });
  }

  function tryInterpretDecodedPayload(decodedText) {
    const trimmed = decodedText.trim();
    if (!trimmed) {
      log("Decoded payload interpretation: empty payload");
      return;
    }

    const likelyJsonLike = trimmed.startsWith("{") || trimmed.startsWith("[");
    log(`Decoded payload appears JSON-like: ${likelyJsonLike ? "yes" : "no"}`);

    if (!likelyJsonLike) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      const rootType = Array.isArray(parsed) ? "array" : typeof parsed;
      log(`Decoded payload JSON parse: success (root type: ${rootType})`);

      if (Array.isArray(parsed)) {
        log(`Decoded payload root array length: ${parsed.length}`);
      } else if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed);
        log(`Decoded payload root keys (${keys.length}): ${keys.slice(0, 30).join(", ")}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Decoded payload JSON parse: failed (${message})`);

      const recordHints = ["\"message\"", "\"author\"", "\"content_type\"", "\"parts\""];
      recordHints.forEach((hint) => {
        const count = decodedText.split(hint).length - 1;
        log(`Decoded payload hint count ${hint}: ${count}`);
      });
    }
  }

  function inspectStreamEnqueuePayloads(doc) {
    log("--- React Router stream enqueue debug pass ---");

    const streamScripts = getStreamEnqueueScripts(doc);
    log(`enqueue scripts found: ${streamScripts.length}`);

    if (streamScripts.length === 0) {
      return;
    }

    streamScripts.forEach((item) => {
      const preview = item.scriptText.slice(0, 300).replace(/\s+/g, " ");
      log(`enqueue script #${item.index}: textLength=${item.scriptText.length}`);
      log(`enqueue script #${item.index} preview (first 300 chars): ${preview}`);

      const payload = extractEnqueuePayload(item.scriptText);
      if (!payload) {
        log(`enqueue script #${item.index}: payload extraction failed`);
        return;
      }

      log(`enqueue script #${item.index}: extracted payload length=${payload.length}`);

      const decoded = decodeEscapedPayload(payload);
      log(`enqueue script #${item.index}: decoded payload length=${decoded.length}`);
      log(`enqueue script #${item.index}: decoded payload preview (first 1000 chars):`);
      log(decoded.slice(0, 1000));

      log(`enqueue script #${item.index}: marker scan start`);
      logMarkerHits(decoded, STREAM_MARKERS);

      log(`enqueue script #${item.index}: structure interpretation start`);
      tryInterpretDecodedPayload(decoded);
    });
  }

  log("Extension started");
  log("DOM loaded");

  loadButton.addEventListener("click", async () => {
    try {
      log("Button clicked");

      const url = urlInput.value.trim();
      log(`URL read: ${url}`);
      log(`URL: ${url}`);

      if (!url) {
        status.textContent = "Status: Error - URL is required";
        log("ERROR: URL is required");
        return;
      }

      status.textContent = "Status: Fetching...";
      log("Fetch started");
      log("Fetching page...");

      const response = await fetch(url);
      log(`Fetch status: ${response.status}`);
      log(`Status: ${response.status}`);

      const html = await response.text();
      log(`HTML length: ${html.length}`);

      log("HTML preview (first 1000 chars):");
      log(html.slice(0, 1000));

      log("Parsing HTML with DOMParser...");
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      log(`Document title: ${doc.title || "(empty)"}`);

      log("--- Script inventory ---");
      scanScripts(doc);

      log("--- Raw HTML marker search ---");
      DATA_MARKERS.forEach((marker) => searchRawHtml(html, marker));

      inspectStreamEnqueuePayloads(doc);

      status.textContent = `Status: Success (${response.status})`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`ERROR: ${message}`);
      status.textContent = `Status: Error - ${message}`;
    }
  });
});
