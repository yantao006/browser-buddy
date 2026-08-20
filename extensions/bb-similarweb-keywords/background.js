function textToDataUrl(text, mime) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || (message.type !== "download-csv" && message.type !== "download-file")) return undefined;
  const filename = String(message.filename || "organic-keywords.csv").replace(/[\\/:*?"<>|]+/g, "-");
  const mime = String(message.mime || "text/csv;charset=utf-8");
  const url = message.base64
    ? `data:${mime};base64,${message.base64}`
    : textToDataUrl(String(message.text || ""), mime);
  chrome.downloads.download(
    {
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    },
    (downloadId) => {
      const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
      sendResponse({ ok: !error && Number.isFinite(downloadId), downloadId, error });
    },
  );
  return true;
});
