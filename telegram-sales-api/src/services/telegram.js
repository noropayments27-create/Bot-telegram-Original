const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

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

async function sendMessage(telegramId, text, options = {}) {
  const token = getToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: telegramId, text, ...options }),
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

async function sendMultipart(
  telegramId,
  endpoint,
  fieldName,
  filePath,
  filename
) {
  const token = getToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/${endpoint}`;
  const buffer = await fs.readFile(filePath);
  const hasFormData = typeof FormData !== "undefined" && typeof Blob !== "undefined";
  let response;

  if (hasFormData) {
    const form = new FormData();
    form.append("chat_id", String(telegramId));
    form.append(fieldName, new Blob([buffer]), filename);
    response = await fetch(url, {
      method: "POST",
      body: form,
    });
  } else {
    const boundary = `----tg-${crypto.randomBytes(8).toString("hex")}`;
    const header = `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
      `${telegramId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(header, "utf8"),
      buffer,
      Buffer.from(footer, "utf8"),
    ]);
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
  }

  if (!response.ok) {
    throw new Error("TELEGRAM_SEND_FAILED");
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error("TELEGRAM_SEND_FAILED");
  }

  return data.result;
}

async function sendMedia(telegramId, endpoint, fieldName, payload) {
  const token = getToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/${endpoint}`;

  if (payload.file_id || payload.url) {
    const body = {
      chat_id: telegramId,
      [fieldName]: payload.file_id || payload.url,
    };
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  if (payload.path) {
    const filename =
      payload.filename || path.basename(payload.path) || "archivo";
    return sendMultipart(telegramId, endpoint, fieldName, payload.path, filename);
  }

  throw new Error("TELEGRAM_MEDIA_NOT_FOUND");
}

async function sendDocument(telegramId, payload) {
  return sendMedia(telegramId, "sendDocument", "document", payload);
}

async function sendPhoto(telegramId, payload) {
  return sendMedia(telegramId, "sendPhoto", "photo", payload);
}

async function sendVideo(telegramId, payload) {
  return sendMedia(telegramId, "sendVideo", "video", payload);
}

module.exports = {
  getFilePath,
  downloadFile,
  sendMessage,
  sendDocument,
  sendPhoto,
  sendVideo,
};
