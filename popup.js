console.log("Extension started");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded");

  const urlInput = document.getElementById("urlInput");
  const loadButton = document.getElementById("loadButton");
  const debugOutput = document.getElementById("debugOutput");
  const status = document.getElementById("status");

  function log(message) {
    console.log(message);
    debugOutput.value += `${message}\n`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
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

      const preview = html.slice(0, 1000);
      debugOutput.value += `${preview}\n`;
      debugOutput.scrollTop = debugOutput.scrollHeight;

      status.textContent = `Status: Success (${response.status})`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`ERROR: ${message}`);
      status.textContent = `Status: Error - ${message}`;
    }
  });
});
