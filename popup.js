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

  const MESSAGE_KEYS = [
    "author",
    "content",
    "parts",
    "content_type",
    "create_time",
    "update_time",
    "recipient",
    "role",
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

    const promisingScripts = [];

    scripts.forEach((script, index) => {
      const type = script.getAttribute("type") || "(none)";
      const text = script.textContent || "";
      const textLength = text.length;
      const preview = text.slice(0, 200).replace(/\s+/g, " ");

      log(`Script #${index}: type=${type}, textLength=${textLength}`);
      log(`Script #${index} preview (first 200 chars): ${preview}`);

      const foundMarkers = DATA_MARKERS.filter((marker) => {
        if (marker === "application/json") {
          return type.toLowerCase().includes("application/json");
        }

        return text.includes(marker);
      });

      if (foundMarkers.length > 0) {
        log(`Script #${index} markers found: ${foundMarkers.join(", ")}`);
        promisingScripts.push({
          index,
          type,
          textLength,
          preview500: text.slice(0, 500).replace(/\s+/g, " ")
        });
      } else {
        log(`Script #${index} markers found: none`);
      }
    });

    if (promisingScripts.length === 0) {
      log("No promising scripts found by marker scan.");
      return;
    }

    log(`Promising scripts count: ${promisingScripts.length}`);
    promisingScripts.forEach((script) => {
      log(
        `Promising script #${script.index}: type=${script.type}, length=${script.textLength}`
      );
      log(`Promising script #${script.index} preview (first 500 chars): ${script.preview500}`);
    });
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isPromisingMessageNode(node) {
    if (!isPlainObject(node)) {
      return false;
    }

    return MESSAGE_KEYS.some((key) => key in node);
  }

  function previewNode(node) {
    const previewParts = [];

    const role = node.role || node?.author?.role || node?.author?.name;
    if (role) {
      previewParts.push(`role/author=${String(role)}`);
    }

    let stringPreview = "";

    if (typeof node.content === "string") {
      stringPreview = node.content;
    } else if (typeof node.message === "string") {
      stringPreview = node.message;
    } else if (typeof node.text === "string") {
      stringPreview = node.text;
    } else if (Array.isArray(node.parts)) {
      const joined = node.parts
        .filter((part) => typeof part === "string")
        .join(" ")
        .trim();
      if (joined) {
        previewParts.push(`partsPreview=${joined.slice(0, 160)}`);
      }
    } else if (Array.isArray(node?.content?.parts)) {
      const joined = node.content.parts
        .filter((part) => typeof part === "string")
        .join(" ")
        .trim();
      if (joined) {
        previewParts.push(`content.partsPreview=${joined.slice(0, 160)}`);
      }
    }

    if (stringPreview) {
      previewParts.push(`stringPreview=${stringPreview.slice(0, 160)}`);
    }

    return previewParts.length > 0 ? previewParts.join(" | ") : "(no compact preview)";
  }

  function walkObject(obj, path, findings) {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        walkObject(item, `${path}[${index}]`, findings);
      });
      return;
    }

    if (!isPlainObject(obj)) {
      return;
    }

    if (isPromisingMessageNode(obj)) {
      const keys = Object.keys(obj);
      findings.push({
        path,
        keys,
        preview: previewNode(obj)
      });
    }

    Object.entries(obj).forEach(([key, value]) => {
      const childPath = path ? `${path}.${key}` : key;
      walkObject(value, childPath, findings);
    });
  }

  function parseClientBootstrap(doc) {
    log("--- client-bootstrap JSON debug pass ---");

    const script = doc.querySelector('script[type="application/json"]#client-bootstrap');
    if (!script) {
      log("client-bootstrap script found: no");
      return;
    }

    log("client-bootstrap script found: yes");

    const rawJson = script.textContent || "";
    log(`client-bootstrap JSON text length: ${rawJson.length}`);

    let parsed;
    try {
      parsed = JSON.parse(rawJson);
      log("client-bootstrap JSON parse: success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`client-bootstrap JSON parse: failed (${message})`);
      return;
    }

    if (!isPlainObject(parsed)) {
      log(`client-bootstrap top-level type: ${Array.isArray(parsed) ? "array" : typeof parsed}`);
      return;
    }

    const topLevelKeys = Object.keys(parsed);
    log(`client-bootstrap top-level keys (${topLevelKeys.length}): ${topLevelKeys.join(", ")}`);

    const findings = [];
    walkObject(parsed, "clientBootstrap", findings);

    if (findings.length === 0) {
      log("Promising message-like nodes found: 0");
      return;
    }

    log(`Promising message-like nodes found: ${findings.length}`);

    const maxToLog = 80;
    findings.slice(0, maxToLog).forEach((item, idx) => {
      log(`Node ${idx + 1}: path=${item.path}`);
      log(`Node ${idx + 1}: keys=${item.keys.join(", ")}`);
      log(`Node ${idx + 1}: preview=${item.preview}`);
    });

    if (findings.length > maxToLog) {
      log(`...truncated ${findings.length - maxToLog} additional nodes`);
    }
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

      const main = doc.querySelector("main");
      log(`Main exists: ${main ? "yes" : "no"}`);

      log("--- Script scan debug pass ---");
      scanScripts(doc);

      log("--- Raw HTML marker search ---");
      DATA_MARKERS.forEach((marker) => searchRawHtml(html, marker));

      parseClientBootstrap(doc);

      status.textContent = `Status: Success (${response.status})`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`ERROR: ${message}`);
      status.textContent = `Status: Error - ${message}`;
    }
  });
});
