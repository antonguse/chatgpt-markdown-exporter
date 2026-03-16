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

  function log(message) {
    console.log(message);
    debugOutput.value += `${message}\n`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
  }

  function searchRawHtml(html, marker) {
    const index = html.indexOf(marker);

    if (index === -1) {
      log(`Raw HTML marker \"${marker}\": NOT FOUND`);
      return;
    }

    const start = Math.max(0, index - 120);
    const end = Math.min(html.length, index + marker.length + 180);
    const nearby = html.slice(start, end).replace(/\s+/g, " ");

    log(`Raw HTML marker \"${marker}\": FOUND at index ${index}`);
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

      status.textContent = `Status: Success (${response.status})`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`ERROR: ${message}`);
      status.textContent = `Status: Error - ${message}`;
    }
  });
});
