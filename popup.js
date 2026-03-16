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

      const htmlPreview = html.slice(0, 1000);
      log("HTML preview (first 1000 chars):");
      debugOutput.value += `${htmlPreview}\n`;
      debugOutput.scrollTop = debugOutput.scrollHeight;

      log("Parsing HTML with DOMParser...");
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      log(`Document title: ${doc.title || "(empty)"}`);

      const main = doc.querySelector("main");
      log(`Main exists: ${main ? "yes" : "no"}`);

      if (main) {
        const mainText = (main.innerText || "").trim();
        log(`main.innerText length: ${mainText.length}`);
        log(`main.innerText preview (first 500 chars): ${mainText.slice(0, 500)}`);

        const divCount = main.querySelectorAll("div").length;
        log(`Div count inside <main>: ${divCount}`);

        const candidateBlocks = Array.from(main.querySelectorAll("div"))
          .map((element, index) => {
            const text = (element.innerText || "").trim();
            return {
              index,
              length: text.length,
              preview: text.slice(0, 120)
            };
          })
          .filter((block) => block.length > 200)
          .slice(0, 10);

        log(`Candidate blocks found (text length > 200): ${candidateBlocks.length}`);
        candidateBlocks.forEach((block, idx) => {
          log(
            `Candidate ${idx + 1}: divIndex=${block.index}, length=${block.length}, preview=${block.preview}`
          );
        });
      }

      status.textContent = `Status: Success (${response.status})`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`ERROR: ${message}`);
      status.textContent = `Status: Error - ${message}`;
    }
  });
});
