import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, apiFetchBinary, getAuthToken } from "../../lib/api";
import { IconBroadcasts } from "../../components/PanelIcons";
import Toast from "../../components/Toast";

const SEGMENT_OPTIONS = [
  { value: "ALL_USERS", label: "Todos" },
  { value: "BUYERS", label: "Compradores" },
  { value: "AFFILIATES", label: "Afiliados" },
  { value: "CUSTOM", label: "Personalizado" },
  { value: "GROUPS", label: "Grupos" },
  { value: "CHANNELS", label: "Canales" },
];

function parseTelegramIds(value) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item));
}

function parseChatIds(value) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item && /^-?[0-9]+$/.test(item));
}

const formatSegmentLabel = (segment) => {
  if (segment === "BUYERS_AFFILIATES") {
    return "Compradores y afiliados";
  }
  const option = SEGMENT_OPTIONS.find((item) => item.value === segment);
  return option ? option.label : segment;
};

const formatStatusLabel = (status) => {
  if (!status) {
    return "-";
  }
  const key = String(status).toUpperCase();
  if (key === "SENT") {
    return "Enviado";
  }
  if (key === "FAILED") {
    return "Fallido";
  }
  const map = {
    DRAFT: "Borrador",
  };
  return map[key] || status;
};

const formatStatusLabelWithCount = (status, sentCount) => {
  if (!status) {
    return "-";
  }
  const key = String(status).toUpperCase();
  const delivered = Number(sentCount || 0);
  if (delivered > 0) {
    return `Enviado a: ${delivered}`;
  }
  if (key === "SENT" || key === "FAILED") {
    return "Fallido";
  }
  return formatStatusLabel(key);
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const markdownToEditorHtml = (raw) => {
  if (!raw) {
    return "";
  }
  const value = String(raw);
  if (/<\/?(b|strong|i|em|u|s|strike|del|a|blockquote|code|pre|br|div|p)/i.test(value)) {
    return value;
  }
  let text = escapeHtml(value);
  text = text.replace(/```([\s\S]+?)```/g, "<pre><code>$1</code></pre>");
  text = text.replace(/`([^`]+?)`/g, "<code>$1</code>");
  text = text.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^_]+?)__/g, "<u>$1</u>");
  text = text.replace(/~~([^~]+?)~~/g, "<s>$1</s>");
  text = text.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<i>$2</i>");
  text = text
    .split("\n")
    .map((line) => {
      if (/^>\s?/.test(line)) {
        return `<blockquote>${line.replace(/^>\s?/, "")}</blockquote>`;
      }
      return line;
    })
    .join("<br>");
  return text;
};

const normalizeMessageForSave = (html) => {
  if (!html) {
    return "";
  }
  const container = document.createElement("div");
  container.innerHTML = html;

  const serialize = (node) => {
    if (!node) {
      return "";
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }
    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(serialize).join("");

    if (tag === "br") {
      return "\n";
    }
    if (tag === "b" || tag === "strong") {
      return `<b>${inner}</b>`;
    }
    if (tag === "i" || tag === "em") {
      return `<i>${inner}</i>`;
    }
    if (tag === "u") {
      return `<u>${inner}</u>`;
    }
    if (tag === "s" || tag === "strike" || tag === "del") {
      return `<s>${inner}</s>`;
    }
    if (tag === "code") {
      const className = String(node.getAttribute("class") || "").trim();
      const safeClass = /^language-[a-z0-9_-]+$/i.test(className) ? className : "";
      if (safeClass) {
        return `<code class="${escapeHtml(safeClass)}">${inner}</code>`;
      }
      return `<code>${inner}</code>`;
    }
    if (tag === "pre") {
      const codeChild = Array.from(node.childNodes).find(
        (child) => child?.nodeType === Node.ELEMENT_NODE && String(child.tagName || "").toLowerCase() === "code"
      );
      const codeInner = codeChild
        ? Array.from(codeChild.childNodes).map(serialize).join("")
        : inner;
      const codeClass = codeChild ? String(codeChild.getAttribute("class") || "").trim() : "";
      const safeClass = /^language-[a-z0-9_-]+$/i.test(codeClass) ? codeClass : "";
      if (safeClass) {
        return `<pre><code class="${escapeHtml(safeClass)}">${codeInner}</code></pre>`;
      }
      return `<pre><code>${codeInner}</code></pre>`;
    }
    if (tag === "blockquote") {
      const isExpandable = node.hasAttribute("expandable");
      return isExpandable
        ? `<blockquote expandable>${inner}</blockquote>`
        : `<blockquote>${inner}</blockquote>`;
    }
    if (tag === "a") {
      const href = String(node.getAttribute("href") || "").trim();
      if (!/^https?:\/\//i.test(href)) {
        return inner;
      }
      return `<a href="${escapeHtml(href)}">${inner || escapeHtml(href)}</a>`;
    }
    if (tag === "div" || tag === "p" || tag === "li") {
      return `${inner}\n`;
    }
    return inner;
  };

  return Array.from(container.childNodes)
    .map(serialize)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const findClosestTag = (node, tagName) => {
  let current = node;
  const targetTag = String(tagName || "").toLowerCase();
  while (current) {
    if (
      current.nodeType === Node.ELEMENT_NODE
      && String(current.tagName || "").toLowerCase() === targetTag
    ) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
};

const findSelectedContainer = (snapshot, tagName) => {
  if (!snapshot || !snapshot.range) {
    return null;
  }
  const startMatch = findClosestTag(snapshot.range.startContainer, tagName);
  const endMatch = findClosestTag(snapshot.range.endContainer, tagName);
  if (startMatch && startMatch === endMatch) {
    return startMatch;
  }
  const anchorMatch = findClosestTag(snapshot.selection?.anchorNode, tagName);
  const focusMatch = findClosestTag(snapshot.selection?.focusNode, tagName);
  if (anchorMatch && anchorMatch === focusMatch) {
    return anchorMatch;
  }
  return null;
};

const unwrapNode = (node) => {
  if (!node || !node.parentNode) {
    return;
  }
  const parent = node.parentNode;
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
};

export default function BroadcastsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [selectedBroadcastIds, setSelectedBroadcastIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [message, setMessage] = useState("");
  const [segments, setSegments] = useState(["ALL_USERS"]);
  const [customIdsText, setCustomIdsText] = useState("");
  const [chatIdsText, setChatIdsText] = useState("");
  const [exceptIdsText, setExceptIdsText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [existingImagePreviewUrl, setExistingImagePreviewUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageCleared, setImageCleared] = useState(false);
  const [buttons, setButtons] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [messageSyncNonce, setMessageSyncNonce] = useState(0);
  const [isMessageLinkModalOpen, setIsMessageLinkModalOpen] = useState(false);
  const [messageLinkText, setMessageLinkText] = useState("");
  const [messageLinkUrl, setMessageLinkUrl] = useState("https://");
  const [messageLinkError, setMessageLinkError] = useState("");
  const messageInputRef = useRef(null);
  const messageLinkSelectionRef = useRef(null);
  const existingImageObjectUrlRef = useRef("");
  const listMaxHeight = 42 + 5 * 52;

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadBroadcasts = async () => {
      try {
        let page = 1;
        let totalPages = 1;
        const all = [];
        while (page <= totalPages) {
          const params = new URLSearchParams({
            page: String(page),
            page_size: "50",
          });
          const data = await apiFetch(`/admin/broadcasts?${params.toString()}`);
          all.push(...(data.items || []));
          totalPages = data.total_pages || 1;
          page += 1;
        }
        setItems(all);
        setError("");
      } catch (err) {
        setError("No se pudo cargar las difusiones.");
        setToast("No se pudo cargar las difusiones.");
      }
    };

    loadBroadcasts();
  }, []);

  const removeDetail = useCallback((broadcastId) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[broadcastId];
      return next;
    });
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[broadcastId];
      return next;
    });
    setDetailMessages((prev) => {
      const next = { ...prev };
      delete next[broadcastId];
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (broadcastId) => {
    if (!broadcastId) {
      return;
    }
    setDetailLoading((prev) => ({ ...prev, [broadcastId]: true }));
    setDetailErrors((prev) => ({ ...prev, [broadcastId]: "" }));
    try {
      const data = await apiFetch(`/admin/broadcasts/${broadcastId}`);
      setDetails((prev) => ({ ...prev, [broadcastId]: data }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [broadcastId]: "No se pudo cargar la difusión.",
      }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [broadcastId]: false }));
    }
  }, []);

  const handleViewBroadcast = async (broadcastId) => {
    if (!broadcastId) {
      return;
    }
    setSelectedBroadcastIds((prev) => {
      if (prev.includes(broadcastId)) {
        removeDetail(broadcastId);
        return prev.filter((id) => id !== broadcastId);
      }
      const next = [broadcastId, ...prev.filter((id) => id !== broadcastId)];
      if (next.length > 3) {
        const removed = next.pop();
        if (removed) {
          removeDetail(removed);
        }
      }
      return next;
    });
    await loadDetail(broadcastId);
  };

  useEffect(() => {
    selectedBroadcastIds.forEach((broadcastId) => {
      if (!details[broadcastId] && !detailLoading[broadcastId]) {
        loadDetail(broadcastId);
      }
    });
  }, [detailLoading, details, loadDetail, selectedBroadcastIds]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const editor = messageInputRef.current;
    if (!editor) {
      return;
    }
    if (!showCreate) {
      return;
    }
    editor.innerHTML = message || "";
  }, [messageSyncNonce, showCreate]);

  const numberById = useMemo(() => {
    const map = new Map();
    const sorted = [...items].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });
    sorted.forEach((item, index) => {
      map.set(item.id, String(index + 1).padStart(4, "0"));
    });
    return map;
  }, [items]);

  const getBroadcastNumber = (broadcastId) => numberById.get(broadcastId) || "----";

  const toggleSegment = (value) => {
    setSegments((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const setCreateErrorMessage = useCallback((message) => {
    setCreateError(message);
    if (message) {
      setToast(message);
    }
  }, []);

  const clearExistingImagePreview = useCallback(() => {
    if (existingImageObjectUrlRef.current) {
      URL.revokeObjectURL(existingImageObjectUrlRef.current);
      existingImageObjectUrlRef.current = "";
    }
    setExistingImagePreviewUrl("");
  }, []);

  const loadExistingImagePreview = useCallback(async (broadcastId) => {
    clearExistingImagePreview();
    try {
      const { buffer, contentType } = await apiFetchBinary(`/admin/broadcasts/${broadcastId}/image`);
      if (!buffer || buffer.byteLength === 0) {
        return;
      }
      const blob = new Blob([buffer], {
        type: contentType || "image/jpeg",
      });
      const objectUrl = URL.createObjectURL(blob);
      existingImageObjectUrlRef.current = objectUrl;
      setExistingImagePreviewUrl(objectUrl);
    } catch (err) {
      // Broadcast may not have image; no-op.
    }
  }, [clearExistingImagePreview]);

  useEffect(() => () => {
    if (existingImageObjectUrlRef.current) {
      URL.revokeObjectURL(existingImageObjectUrlRef.current);
      existingImageObjectUrlRef.current = "";
    }
  }, []);

  const syncMessageFromEditor = useCallback(() => {
    const editor = messageInputRef.current;
    if (!editor) {
      return;
    }
    setMessage(editor.innerHTML || "");
  }, []);

  const getMessageSelection = useCallback(() => {
    const editor = messageInputRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    if (!editor.contains(startNode) || !editor.contains(endNode)) {
      return null;
    }
    return {
      editor,
      selection,
      range,
      text: selection.toString(),
    };
  }, []);

  const requireMessageSelection = useCallback(
    (errorMessage = "Selecciona texto para aplicar formato.") => {
      const snapshot = getMessageSelection();
      if (!snapshot || snapshot.range.collapsed || !snapshot.text.trim()) {
        setCreateErrorMessage(errorMessage);
        return null;
      }
      setCreateError("");
      return snapshot;
    },
    [getMessageSelection, setCreateErrorMessage]
  );

  const runMessageCommand = useCallback(
    (command, value = null, options = {}) => {
      const { requiresSelection = true, selectionError = "Selecciona texto para aplicar formato." } = options;
      if (requiresSelection && !requireMessageSelection(selectionError)) {
        return false;
      }
      const editor = messageInputRef.current;
      if (!editor) {
        return false;
      }
      editor.focus();
      document.execCommand(command, false, value);
      syncMessageFromEditor();
      setCreateError("");
      return true;
    },
    [requireMessageSelection, syncMessageFromEditor]
  );

  const toggleMessageMonospace = useCallback(() => {
    const snapshot = requireMessageSelection();
    if (!snapshot) {
      return;
    }
    const { selection } = snapshot;
    const anchorNode = selection.anchorNode;
    const codeNode = findClosestTag(anchorNode, "code");
    const preNode = findClosestTag(anchorNode, "pre");
    if (codeNode && !preNode) {
      unwrapNode(codeNode);
      syncMessageFromEditor();
      return;
    }
    if (preNode) {
      unwrapNode(preNode);
      syncMessageFromEditor();
      return;
    }
    const selected = snapshot.text;
    if (selected.includes("\n")) {
      runMessageCommand("formatBlock", "pre");
    } else {
      runMessageCommand("insertHTML", `<code>${escapeHtml(selected)}</code>`);
    }
  }, [requireMessageSelection, runMessageCommand, syncMessageFromEditor]);

  const preventToolbarBlur = useCallback((event) => {
    event.preventDefault();
  }, []);

  const insertMessageQuote = useCallback(() => {
    const snapshot = requireMessageSelection("Selecciona el texto para citar.");
    if (!snapshot) {
      return;
    }
    const quoteNode = findSelectedContainer(snapshot, "blockquote");
    if (quoteNode) {
      unwrapNode(quoteNode);
      syncMessageFromEditor();
      return;
    }
    const selected = escapeHtml(snapshot.text || "");
    const html = `<blockquote>${selected}</blockquote>`;
    runMessageCommand("insertHTML", html, { requiresSelection: false });
  }, [requireMessageSelection, runMessageCommand, syncMessageFromEditor]);

  const insertMessageShellCode = useCallback(() => {
    const snapshot = requireMessageSelection("Selecciona el texto para formatear como código.");
    if (!snapshot) {
      return;
    }
    const preNode = findSelectedContainer(snapshot, "pre");
    if (preNode) {
      unwrapNode(preNode);
      syncMessageFromEditor();
      return;
    }
    const codeNode = findSelectedContainer(snapshot, "code");
    if (codeNode && !findClosestTag(codeNode.parentNode, "pre")) {
      unwrapNode(codeNode);
      syncMessageFromEditor();
      return;
    }
    const selected = escapeHtml(snapshot.text || "");
    const html = `<pre>${selected}</pre>`;
    runMessageCommand("insertHTML", html, { requiresSelection: false });
  }, [requireMessageSelection, runMessageCommand, syncMessageFromEditor]);

  const openMessageLinkModal = useCallback(() => {
    const snapshot = requireMessageSelection("Selecciona el texto para crear el enlace.");
    if (!snapshot) {
      return;
    }
    messageLinkSelectionRef.current = snapshot.range.cloneRange();
    const anchor = findClosestTag(snapshot.selection.anchorNode, "a")
      || findClosestTag(snapshot.selection.focusNode, "a");
    const currentUrl = String(anchor?.getAttribute("href") || "").trim();
    setMessageLinkText(snapshot.text.trim());
    setMessageLinkUrl(/^https?:\/\//i.test(currentUrl) ? currentUrl : "https://");
    setMessageLinkError("");
    setIsMessageLinkModalOpen(true);
  }, [requireMessageSelection]);

  const closeMessageLinkModal = useCallback(() => {
    setIsMessageLinkModalOpen(false);
    setMessageLinkError("");
    messageLinkSelectionRef.current = null;
    const editor = messageInputRef.current;
    if (editor) {
      editor.focus();
    }
  }, []);

  const submitMessageLinkModal = useCallback(() => {
    const text = String(messageLinkText || "").trim();
    const href = String(messageLinkUrl || "").trim();
    if (!text) {
      setMessageLinkError("Escribe el texto del enlace.");
      return;
    }
    if (!/^https?:\/\//i.test(href)) {
      setMessageLinkError("El enlace debe iniciar por http:// o https://");
      return;
    }
    const editor = messageInputRef.current;
    const savedRange = messageLinkSelectionRef.current;
    if (!editor || !savedRange) {
      setMessageLinkError("Selecciona el texto nuevamente.");
      return;
    }
    editor.focus();
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    runMessageCommand(
      "insertHTML",
      `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`,
      { requiresSelection: false }
    );
    setIsMessageLinkModalOpen(false);
    setMessageLinkError("");
    messageLinkSelectionRef.current = null;
  }, [messageLinkText, messageLinkUrl, runMessageCommand]);

  const handleMessageKeyDown = useCallback((event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) {
      return;
    }
    const key = String(event.key || "").toLowerCase();
    const withShift = Boolean(event.shiftKey);

    if (key === "b" && !withShift) {
      event.preventDefault();
      runMessageCommand("bold");
      return;
    }
    if (key === "i" && !withShift) {
      event.preventDefault();
      runMessageCommand("italic");
      return;
    }
    if (key === "u" && !withShift) {
      event.preventDefault();
      runMessageCommand("underline");
      return;
    }
    if (key === "k" && !withShift) {
      event.preventDefault();
      openMessageLinkModal();
      return;
    }
    if (key === "x" && withShift) {
      event.preventDefault();
      runMessageCommand("strikeThrough");
      return;
    }
    if (key === "." && withShift) {
      event.preventDefault();
      insertMessageQuote();
      return;
    }
    if (key === "c" && withShift) {
      event.preventDefault();
      insertMessageShellCode();
      return;
    }
    if (key === "m" && withShift) {
      event.preventDefault();
      toggleMessageMonospace();
    }
  }, [insertMessageQuote, insertMessageShellCode, openMessageLinkModal, runMessageCommand, toggleMessageMonospace]);

  const isValidUrl = (value) => {
    if (!value) {
      return false;
    }
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (err) {
      return false;
    }
  };

  const handleImageFile = async (file) => {
    if (!file) {
      return;
    }
    if (imageDataUrl || existingImagePreviewUrl) {
      setCreateErrorMessage("Solo se permite una imagen por difusión. Quita la actual.");
      return;
    }
    if (!file.type || !file.type.startsWith("image/")) {
      setCreateErrorMessage("La imagen debe ser un archivo válido.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setCreateErrorMessage("La imagen supera el límite de 6MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      clearExistingImagePreview();
      setImageDataUrl(reader.result || "");
      setImageName(file.name || "imagen");
      setImageCleared(false);
      setCreateError("");
    };
    reader.onerror = () => {
      setCreateErrorMessage("No se pudo leer la imagen.");
    };
    reader.readAsDataURL(file);
  };

  const addButton = () => {
    setButtons((prev) => [...prev, { text: "", url: "" }]);
  };

  const updateButton = (index, key, value) => {
    setButtons((prev) =>
      prev.map((button, i) => (i === index ? { ...button, [key]: value } : button))
    );
  };

  const removeButton = (index) => {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  };

  const startEdit = async (broadcast) => {
    if (!broadcast) {
      return;
    }
    let source = broadcast;
    try {
      const detail = await apiFetch(`/admin/broadcasts/${broadcast.id}`);
      if (detail && detail.broadcast) {
        source = detail.broadcast;
        setDetails((prev) => ({ ...prev, [broadcast.id]: detail }));
      }
    } catch (err) {
      // Fall back to list row data if detail fetch fails.
    }
    setEditingId(broadcast.id);
    setShowCreate(true);
    setMessage(markdownToEditorHtml(source.message_text || ""));
    setMessageSyncNonce((prev) => prev + 1);
    setSegments([source.segment || "ALL_USERS"]);
    setCustomIdsText("");
    setChatIdsText("");
    setExceptIdsText(Array.isArray(source.except_ids) ? source.except_ids.join(", ") : "");
    setButtons(Array.isArray(source.buttons) ? source.buttons : []);
    clearExistingImagePreview();
    setImageDataUrl("");
    setImageName(source.image_filename ? `Imagen actual: ${source.image_filename}` : "");
    setImageCleared(false);
    if (source.image_filename) {
      await loadExistingImagePreview(broadcast.id);
    }
  };

  const resetCreateForm = () => {
    setEditingId("");
    setMessage("");
    setMessageSyncNonce((prev) => prev + 1);
    setCustomIdsText("");
    setChatIdsText("");
    setExceptIdsText("");
    clearExistingImagePreview();
    setImageDataUrl("");
    setImageName("");
    setImageCleared(false);
    setButtons([]);
    setSegments(["ALL_USERS"]);
    setCreateErrorMessage("");
    setShowCreate(false);
  };

    const handleSaveBroadcast = async (broadcastId, nextSaved) => {
    try {
      const data = await apiFetch(`/admin/broadcasts/${broadcastId}`, {
        method: "PATCH",
        body: JSON.stringify({ saved: nextSaved }),
      });
      setItems((prev) =>
        prev.map((item) => (item.id === broadcastId ? data.broadcast : item))
      );
      setToast(nextSaved ? "Difusión guardada." : "Difusión desguardada.");
    } catch (err) {
      setToast("No se pudo guardar la difusión.");
    }
  };

  const handleDeleteBroadcast = async (broadcast) => {
    if (!broadcast) {
      return;
    }
    if (broadcast.saved) {
      const confirmed = window.confirm("Esta difusión está guardada. ¿Eliminar?");
      if (!confirmed) {
        return;
      }
    }
    try {
      await apiFetch(`/admin/broadcasts/${broadcast.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== broadcast.id));
      setToast("Difusión eliminada.");
    } catch (err) {
      setToast("No se pudo eliminar la difusión.");
    }
  };

  const handleSend = async (broadcastId) => {
    const detail = details[broadcastId];
    if (!detail || !detail.broadcast) {
      return;
    }
    setDetailMessages((prev) => ({ ...prev, [broadcastId]: "" }));
    setDetailErrors((prev) => ({ ...prev, [broadcastId]: "" }));
    setDetailLoading((prev) => ({ ...prev, [broadcastId]: true }));
    try {
      const payload = {};
      if (detail.broadcast.segment === "CUSTOM"
        && Array.isArray(detail.broadcast.custom_telegram_ids)
      ) {
        payload.telegram_ids = detail.broadcast.custom_telegram_ids;
      }
      if (
        (detail.broadcast.segment === "GROUPS"
          || detail.broadcast.segment === "CHANNELS")
        && Array.isArray(detail.broadcast.chat_ids)
      ) {
        payload.chat_ids = detail.broadcast.chat_ids;
      }
      if (
        detail.broadcast.segment === "ALL_USERS"
        && Array.isArray(detail.broadcast.except_ids)
        && detail.broadcast.except_ids.length > 0
      ) {
        payload.except_ids = detail.broadcast.except_ids;
      }
      const data = await apiFetch(`/admin/broadcasts/${broadcastId}/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setDetails((prev) => ({ ...prev, [broadcastId]: data }));
      setItems((prev) =>
        prev.map((item) =>
          item.id === broadcastId
            ? {
                ...item,
                ...data.broadcast,
                last_sent_count: data?.result?.sent_count ?? item.last_sent_count,
                last_failed_count: data?.result?.failed_count ?? item.last_failed_count,
                last_target_count: data?.result?.target_count ?? item.last_target_count,
              }
            : item
        )
      );
      setDetailMessages((prev) => ({
        ...prev,
        [broadcastId]: "Difusión enviada.",
      }));
      if (data?.result) {
        setToast(
          `Enviados: ${data.result.sent_count} · Fallidos: ${data.result.failed_count}`
        );
      } else {
        setToast("Difusión enviada.");
      }
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [broadcastId]: "No se pudo enviar la difusión.",
      }));
      setToast("No se pudo enviar la difusión.");
    } finally {
      setDetailLoading((prev) => ({ ...prev, [broadcastId]: false }));
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateErrorMessage("");
    setCreateLoading(true);
    try {
      const liveEditorMessage = messageInputRef.current
        ? messageInputRef.current.innerHTML || ""
        : message;
      const normalizedMessage = normalizeMessageForSave(liveEditorMessage);
      const messagePlain = normalizedMessage
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();

      if (!messagePlain && !imageDataUrl && !imageName) {
        setCreateErrorMessage("Escribe un mensaje o agrega una imagen.");
        return;
      }
      if (segments.length === 0) {
        setCreateErrorMessage("Selecciona al menos un segmento.");
        return;
      }
      if (editingId && segments.length !== 1) {
        setCreateErrorMessage("Selecciona un solo segmento para editar.");
        return;
      }
      const telegramIds = parseTelegramIds(customIdsText);
      const chatIds = parseChatIds(chatIdsText);
      const exceptIds = parseChatIds(exceptIdsText);
      if (segments.includes("CUSTOM") && telegramIds.length === 0) {
        setCreateErrorMessage("Debes ingresar Telegram IDs válidos.");
        return;
      }
      if (
        (segments.includes("GROUPS") || segments.includes("CHANNELS"))
        && chatIds.length === 0
      ) {
        setCreateErrorMessage("Debes ingresar Chat IDs válidos.");
        return;
      }
      if (segments.includes("ALL_USERS") && exceptIdsText.trim() && exceptIds.length === 0) {
        setCreateErrorMessage("Debes ingresar IDs válidos para 'Excepto'.");
        return;
      }
      const cleanedButtons = buttons
        .map((button) => ({
          text: String(button.text || "").trim(),
          url: String(button.url || "").trim(),
        }))
        .filter((button) => button.text || button.url);
      const invalidButton = cleanedButtons.find(
        (button) => !button.text || !button.url || !isValidUrl(button.url)
      );
      if (invalidButton) {
        setCreateErrorMessage("Revisa los botones: texto y URL válida (http/https).");
        return;
      }
      if (editingId) {
        const payload = {
          message: normalizedMessage,
          segment: segments[0],
        };
        if (imageDataUrl) {
          payload.image_data_url = imageDataUrl;
        }
        if (imageCleared) {
          payload.clear_image = true;
        }
        if (segments[0] === "ALL_USERS") {
          payload.except_ids = exceptIds;
        }
        payload.buttons = cleanedButtons;
        try {
          const data = await apiFetch(`/admin/broadcasts/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          setItems((prev) =>
            prev.map((item) => (item.id === editingId ? data.broadcast : item))
          );
          setDetails((prev) => ({
            ...prev,
            [editingId]: prev[editingId]
              ? {
                  ...prev[editingId],
                  broadcast: {
                    ...(prev[editingId].broadcast || {}),
                    ...data.broadcast,
                  },
                }
              : { broadcast: data.broadcast },
          }));
          setToast("Difusión actualizada.");
          resetCreateForm();
          return;
        } catch (err) {
          setCreateErrorMessage("No se pudo actualizar la difusión.");
          return;
        }
      }

      const created = [];
      let sentTotal = 0;
      let failedTotal = 0;
      let hadError = false;
      for (const segment of segments) {
        const payload = {
          message: normalizedMessage,
          segment,
        };
        if (imageDataUrl) {
          payload.image_data_url = imageDataUrl;
        }
        if (cleanedButtons.length > 0) {
          payload.buttons = cleanedButtons;
        }
        if (segment === "CUSTOM") {
          payload.telegram_ids = telegramIds;
        }
        if (segment === "GROUPS" || segment === "CHANNELS") {
          payload.chat_ids = chatIds;
        }
        if (segment === "ALL_USERS" && exceptIds.length > 0) {
          payload.except_ids = exceptIds;
        }
        try {
          const data = await apiFetch("/admin/broadcasts", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          if (!data?.broadcast?.id) {
            hadError = true;
            continue;
          }
          const sendPayload = {};
          if (segment === "CUSTOM") {
            sendPayload.telegram_ids = telegramIds;
          }
          if (segment === "GROUPS" || segment === "CHANNELS") {
            sendPayload.chat_ids = chatIds;
          }
          if (segment === "ALL_USERS" && exceptIds.length > 0) {
            sendPayload.except_ids = exceptIds;
          }
          try {
            const sendData = await apiFetch(
              `/admin/broadcasts/${data.broadcast.id}/send`,
              {
                method: "POST",
                body: JSON.stringify(sendPayload),
              }
            );
            if (sendData?.result) {
              sentTotal += sendData.result.sent_count || 0;
              failedTotal += sendData.result.failed_count || 0;
            }
            created.push(sendData?.broadcast || data.broadcast);
          } catch (err) {
            created.push(data.broadcast);
            hadError = true;
          }
        } catch (err) {
          hadError = true;
        }
      }
      if (created.length > 0) {
        setItems((prev) => [...created, ...prev]);
      }
      if (hadError) {
        setCreateErrorMessage("Algunas difusiones no se pudieron enviar.");
        if (sentTotal > 0 || failedTotal > 0) {
          setToast(`Enviados: ${sentTotal} · Fallidos: ${failedTotal}`);
        }
        return;
      }
      if (sentTotal > 0 || failedTotal > 0) {
        setToast(`Enviados: ${sentTotal} · Fallidos: ${failedTotal}`);
      } else {
        setToast("Difusión enviada.");
      }
      resetCreateForm();
    } catch (err) {
      setCreateErrorMessage("No se pudo crear la difusión.");
    } finally {
      setCreateLoading(false);
    }
  };

  const activeImagePreviewUrl = imageDataUrl || existingImagePreviewUrl;

  return (
    <main className="page broadcasts-page">
      <section className="card orders-card broadcast-list-card" style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <h1 className="icon-inline"><IconBroadcasts className="panel-icon" /> Difusiones</h1>
          <button
            type="button"
            className="link-button"
            onClick={() => setShowCreate((prev) => !prev)}
          >
            {showCreate ? "Ocultar" : "Crear"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="orders-list" style={{ maxHeight: `${listMaxHeight}px`, overflowY: "auto" }}>
          <table className="orders-table">
            <thead>
              <tr>
                <th align="left">Número</th>
                <th align="left">Estado</th>
                <th align="left">Segmento</th>
                <th align="left">Creado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((broadcast) => (
                <tr
                  key={broadcast.id}
                  className={
                    selectedBroadcastIds.includes(broadcast.id) ? "orders-row-active" : ""
                  }
                  style={
                    !selectedBroadcastIds.includes(broadcast.id) && broadcast.saved
                      ? { background: "rgba(34, 197, 94, 0.12)" }
                      : undefined
                  }
                >
                  <td>{getBroadcastNumber(broadcast.id)}</td>
                  <td>{formatStatusLabelWithCount(broadcast.status, broadcast.last_sent_count)}</td>
                  <td>{formatSegmentLabel(broadcast.segment)}</td>
                  <td>{broadcast.created_at ? new Date(broadcast.created_at).toLocaleString() : "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "nowrap" }}>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewBroadcast(broadcast.id)}
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleSaveBroadcast(broadcast.id, !broadcast.saved)}
                        style={broadcast.saved ? { opacity: 0.6 } : undefined}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => startEdit(broadcast)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleDeleteBroadcast(broadcast)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {showCreate && (
        <section
          className="card orders-card broadcast-create-card"
          style={{
            width: "40%",
            marginTop: "20px",
            marginLeft: 0,
            marginRight: "auto",
            textAlign: "left",
          }}
        >
          <div className="broadcast-create-header">
            <h2 style={{ margin: 0 }}>{editingId ? "Editar difusión" : "Nueva difusión"}</h2>
            {editingId && (
              <button
                type="button"
                className="link-button broadcast-create-close"
                onClick={resetCreateForm}
                title="Cerrar editor"
              >
                Cerrar
              </button>
            )}
          </div>
          {createError && <p className="error">{createError}</p>}
          <form className="form broadcast-create-form" onSubmit={handleCreate}>
            <div className="broadcast-message-label">
              <p className="broadcast-message-title">Mensaje</p>
              <div className="broadcast-message-toolbar">
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runMessageCommand("bold")}>Negrita</button>
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runMessageCommand("italic")}>Cursiva</button>
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runMessageCommand("underline")}>Subrayado</button>
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={openMessageLinkModal}>Enlace</button>
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runMessageCommand("strikeThrough")}>Tachado</button>
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={insertMessageQuote}>Citar</button>
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={insertMessageShellCode}>Codigo</button>
                <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={toggleMessageMonospace}>Monoespaciado</button>
              </div>
              <div
                ref={messageInputRef}
                className="broadcast-message-editor"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Mensaje de difusión"
                onInput={syncMessageFromEditor}
                onKeyDown={handleMessageKeyDown}
                onPaste={(event) => {
                  event.preventDefault();
                  const text = event.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                  syncMessageFromEditor();
                }}
              />
              <div
                className="editor-shortcuts-help"
              >
                <span className="editor-shortcuts-help__icon" aria-hidden="true">i</span>
                <span className="editor-shortcuts-help__label">
                  Atajos
                </span>
                <div className="editor-shortcuts-tooltip" role="tooltip">
                  <span>⌘/Ctrl+B: Negrita</span>
                  <span>⌘/Ctrl+I: Cursiva</span>
                  <span>⌘/Ctrl+U: Subrayado</span>
                  <span>⌘/Ctrl+K: Enlace</span>
                  <span>⌘/Ctrl+Shift+X: Tachado</span>
                  <span>⌘/Ctrl+Shift+.: Citar</span>
                  <span>⌘/Ctrl+Shift+C: Codigo</span>
                  <span>⌘/Ctrl+Shift+M: Monoespaciado</span>
                </div>
              </div>
            </div>
            <label>
              Imagen (opcional)
              <div
                className={`broadcast-image-dropzone${activeImagePreviewUrl ? " has-image" : ""}`}
                style={{
                  border: "1px dashed #ff4d00",
                  borderRadius: "10px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  alignItems: "flex-start",
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files && event.dataTransfer.files[0];
                  handleImageFile(file);
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  disabled={Boolean(activeImagePreviewUrl)}
                  onChange={(event) => handleImageFile(event.target.files[0])}
                />
                <span className="broadcast-image-name">
                  {imageName ? `Archivo: ${imageName}` : "Arrastra o selecciona una imagen."}
                </span>
                {activeImagePreviewUrl && (
                  <img
                    src={activeImagePreviewUrl}
                    alt="Vista previa"
                    className="broadcast-image-preview"
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewUrl(activeImagePreviewUrl)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        setPreviewUrl(activeImagePreviewUrl);
                      }
                    }}
                    style={{ maxWidth: "160px", borderRadius: "8px" }}
                  />
                )}
                {imageName && (
                  <button
                    type="button"
                    className="link-button broadcast-remove-image"
                    style={{ background: "none" }}
                    onClick={() => {
                      clearExistingImagePreview();
                      setImageDataUrl("");
                      setImageName("");
                      setImageCleared(true);
                    }}
                  >
                    Quitar imagen
                  </button>
                )}
              </div>
            </label>
            <label>
              Botones (opcional)
              <div className="broadcast-buttons-wrap" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {buttons.map((button, index) => (
                  <div
                    key={`button-${index}`}
                    className="broadcast-button-row"
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    <input
                      type="text"
                      placeholder="Texto"
                      value={button.text}
                      onChange={(event) => updateButton(index, "text", event.target.value)}
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      value={button.url}
                      onChange={(event) => updateButton(index, "url", event.target.value)}
                    />
                    <button
                      type="button"
                      className="link-button"
                      style={{ background: "none" }}
                      onClick={() => removeButton(index)}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="link-button"
                  data-role="broadcast-add-button"
                  style={{
                    border: "1px solid #ff4d00",
                    width: "30%",
                    margin: "0 auto",
                  }}
                  onClick={addButton}
                >
                  Agregar botón
                </button>
              </div>
            </label>
            <label>
              Segmentos
              <div className="checkbox-row">
                {SEGMENT_OPTIONS.map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={segments.includes(option.value)}
                      onChange={() => toggleSegment(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </label>
            {segments.includes("CUSTOM") && (
              <label>
                Telegram IDs (separados por coma o espacio)
                <textarea
                  value={customIdsText}
                  onChange={(event) => setCustomIdsText(event.target.value)}
                  placeholder="123456789, 987654321"
                />
              </label>
            )}
            {(segments.includes("GROUPS") || segments.includes("CHANNELS")) && (
              <label>
                Chat IDs de grupos/canales (separados por coma o espacio)
                <textarea
                  value={chatIdsText}
                  onChange={(event) => setChatIdsText(event.target.value)}
                  placeholder="-1001234567890, -1009876543210"
                />
              </label>
            )}
            {segments.includes("ALL_USERS") && (
              <label>
                Excepto (usuarios/grupos por ID)
                <textarea
                  value={exceptIdsText}
                  onChange={(event) => setExceptIdsText(event.target.value)}
                  placeholder="123456789, -1001234567890"
                />
                <div className="broadcast-except-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setExceptIdsText("")}
                  >
                    Limpiar IDs
                  </button>
                </div>
              </label>
            )}
            <div className="actions">
              <button
                type="submit"
                disabled={createLoading}
                className={editingId ? "broadcast-save-button-small" : ""}
                style={
                  editingId
                    ? {
                        maxWidth: "101px",
                        minWidth: "84px",
                        padding: "4px 6px",
                      }
                    : undefined
                }
              >
                {createLoading
                  ? editingId
                    ? "Guardando..."
                    : "Enviando..."
                  : editingId
                  ? "Guardar cambios"
                  : "Enviar"}
              </button>
              {editingId && (
                <button type="button" className="link-button" onClick={resetCreateForm}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>
      )}
      {selectedBroadcastIds.length > 0 && (
        <div className="orders-detail-wrap">
          {selectedBroadcastIds.map((broadcastId) => {
            const detail = details[broadcastId];
            const isLoading = detailLoading[broadcastId];
            const errorMessage = detailErrors[broadcastId];
            const message = detailMessages[broadcastId];
            const broadcast = detail?.broadcast;
            const result = detail?.result;

            return (
              <section key={broadcastId} className="card orders-detail-card">
                {isLoading && <p>Cargando...</p>}
                {!isLoading && broadcast && (
                  <>
                    <div className="orders-detail-header">
                      <h2>Difusión Número: {getBroadcastNumber(broadcast.id)}</h2>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewBroadcast(broadcast.id)}
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="orders-detail-separator"></div>
                    {message && <p className="muted">{message}</p>}
                    {errorMessage && <p className="error">{errorMessage}</p>}
                    <div className="orders-detail-grid">
                    <div className="orders-detail-section">
                      <h3>Detalle</h3>
                      <p>Número: {getBroadcastNumber(broadcast.id)}</p>
                      <p>Estado: {formatStatusLabel(broadcast.status)}</p>
                        <p>Segmento: {formatSegmentLabel(broadcast.segment)}</p>
                        <p>
                          Creado:{" "}
                          {broadcast.created_at
                            ? new Date(broadcast.created_at).toLocaleString()
                            : "-"}
                        </p>
                        <p>
                          Enviado:{" "}
                          {broadcast.sent_at
                            ? new Date(broadcast.sent_at).toLocaleString()
                            : "-"}
                        </p>
                      </div>
                      <div className="orders-detail-section">
                        <h3>Mensaje</h3>
                        <div className="detail-textbox">
                          {broadcast.message_text || "-"}
                        </div>
                      </div>
                    </div>
                    {(broadcast.segment === "CUSTOM"
                      || broadcast.segment === "GROUPS"
                      || broadcast.segment === "CHANNELS") && (
                      <>
                        <div className="orders-detail-separator"></div>
                        <div className="orders-detail-section">
                          <h3>Destinatarios</h3>
                          <div className="detail-textbox">
                            {(broadcast.segment === "GROUPS" || broadcast.segment === "CHANNELS")
                              ? (broadcast.chat_ids || []).join(", ") || "-"
                              : (broadcast.custom_telegram_ids || []).join(", ") || "-"}
                          </div>
                        </div>
                      </>
                    )}
                    {result && (
                      <>
                        <div className="orders-detail-separator"></div>
                        <div className="orders-detail-section">
                          <h3>Resultado</h3>
                          <div className="detail-textbox">
                            Objetivo: {result.target_count}{"\n"}
                            Enviados: {result.sent_count}{"\n"}
                            Fallidos: {result.failed_count}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="orders-detail-actions">
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => handleSend(broadcast.id)}
                          disabled={isLoading}
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {!isLoading && !broadcast && errorMessage && (
                  <p className="error">{errorMessage}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {previewUrl && (
        <div
          className="image-preview-overlay"
          role="button"
          tabIndex={0}
          onClick={() => setPreviewUrl("")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setPreviewUrl("");
            }
          }}
        >
          <div className="image-preview-dialog">
            <img src={previewUrl} alt="Vista previa" />
          </div>
        </div>
      )}
      {isMessageLinkModalOpen && (
        <div
          className="editor-link-overlay"
          role="button"
          tabIndex={0}
          onClick={closeMessageLinkModal}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeMessageLinkModal();
            }
          }}
        >
          <div
            className="editor-link-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Crear enlace"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Crear enlace</h3>
            {messageLinkError && <p className="error">{messageLinkError}</p>}
            <label>
              Texto
              <input
                type="text"
                value={messageLinkText}
                onChange={(event) => setMessageLinkText(event.target.value)}
              />
            </label>
            <label>
              URL
              <input
                type="url"
                value={messageLinkUrl}
                onChange={(event) => setMessageLinkUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <div className="actions editor-link-actions">
              <button type="button" className="ghost" onClick={closeMessageLinkModal}>
                Cancelar
              </button>
              <button type="button" onClick={submitMessageLinkModal}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} />
    </main>
  );
}
