const TELEGRAM_API_BASE = "https://api.telegram.org";

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  return token;
}

async function getFilePath(fileId) {
  const token = getToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${encodeURIComponent(
    fileId
  )}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.ok || !data.result || !data.result.file_path) {
    throw new Error("TELEGRAM_GET_FILE_FAILED");
  }

  return data.result.file_path;
}

async function downloadFile(filePath) {
  const token = getToken();
  const url = `${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("TELEGRAM_FILE_DOWNLOAD_FAILED");
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType =
    response.headers.get("content-type") || "application/octet-stream";

  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function sendMessage(telegramId, text) {
  const token = getToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: telegramId, text }),
  });

  if (!response.ok) {
    throw new Error("TELEGRAM_SEND_FAILED");
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error("TELEGRAM_SEND_FAILED");
  }

  return data.result;
}

module.exports = { getFilePath, downloadFile, sendMessage };
