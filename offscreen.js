chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "writeToClipboard") {
    const text = message.text;
    console.log("Writing to clipboard:", text);

    try {
      // Create a temporary textarea element
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed"; // Prevent scrolling to the textarea
      textarea.style.opacity = "0"; // Make it invisible
      document.body.appendChild(textarea);

      // Select the text and copy it
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (successful) {
        console.log("Text copied to clipboard successfully.");
        sendResponse({ success: true });
      } else {
        console.error("Failed to copy text to clipboard using execCommand.");
        sendResponse({ success: false, error: "execCommand failed" });
      }
    } catch (err) {
      console.error("Error copying text to clipboard:", err);
      sendResponse({ success: false, error: err.message });
    }

    // Return true to indicate asynchronous response
    return true;
  }
});

