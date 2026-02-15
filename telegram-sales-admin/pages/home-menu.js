import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../lib/api";
import Toast from "../components/Toast";

const SECTION_OPTIONS = [
  { id: "home", label: "Home", layoutKey: "home_menu_v1" },
  { id: "community", label: "Comunidad", layoutKey: "community_menu_v1" },
  { id: "support", label: "Soporte", layoutKey: "support_menu_v1" },
];
const LOCALES = ["es", "en"];
const MAX_BUTTONS = 24;
const SECTION_DEFAULT_LAYOUTS = {
  home: null,
  community: {
    es: {
      text: "🌐 <b>Información y enlaces oficiales</b>\n\n🖥 Mi Página Web:  <a href=\"https://noropayments.shop/\">CLICK AQUI</a> ⬅️\n⭐️ Canal de promos:  <a href=\"https://t.me/promos_noro\">CLICK AQUI</a> ⬅️\n🔎 Referencias de ventas: <a href=\"https://t.me/Nororeferencias\">CLICK AQUI</a> ⬅️\n🛡 Grupo Privado: <a href=\"https://t.me/+3qNiiq16iXM2YjEx\">CLICK AQUI</a> ⬅️\n🆓 Grupo Ventas Free: <a href=\"https://t.me/VentasNoropayments\">CLICK AQUI</a> ⬅️\n⚙️ Bins Gratis: <a href=\"https://t.me/BinsGratis_NoroPayments\">CLICK AQUI</a> ⬅️\n\n✅ Ofertas exclusivas\n✅ Información actualizada\n✅ Contenido directo y sin vueltas\n\n💬 Si tienes preguntas, escríbenos por soporte y te ayudamos con gusto. 🤝\n\nYouTube:   <a href=\"https://www.youtube.com/@Noropayments\">CLICK AQUI</a>\nTikTok:    <a href=\"https://www.tiktok.com/@noro_payments1\">CLICK AQUI</a>\nWhatsApp:  <a href=\"https://api.whatsapp.com/send/?phone=573009545964&text=Hola+vengo+de+Telegram&type=phone_number&app_absent=0\">CLICK AQUI</a>\nTelegram:  <a href=\"https://t.me/NoroPayments\">CLICK AQUI</a>\nInstagram: <a href=\"https://www.instagram.com/noropayments\">CLICK AQUI</a>\n(Twitter) X: <a href=\"https://x.com/NoroPayments\">CLICK AQUI</a>\n\n🔥 ¡Síguenos y no te pierdas nada! 🔥",
      buttons: [
        [{ label: "⬅️ Volver", action: "nav:back" }, { label: "🏠 Inicio", action: "home:show" }],
      ],
    },
    en: {
      text: "🌐 <b>Official information and links</b>\n\n🖥 My Website:  <a href=\"https://noropayments.shop/\">CLICK HERE</a> ⬅️\n⭐️ Promo channel:  <a href=\"https://t.me/promos_noro\">CLICK HERE</a> ⬅️\n🔎 Sales references: <a href=\"https://t.me/Nororeferencias\">CLICK HERE</a> ⬅️\n🛡 Private group: <a href=\"https://t.me/+3qNiiq16iXM2YjEx\">CLICK HERE</a> ⬅️\n🆓 Free sales group: <a href=\"https://t.me/VentasNoropayments\">CLICK HERE</a> ⬅️\n⚙️ Free bins: <a href=\"https://t.me/BinsGratis_NoroPayments\">CLICK HERE</a> ⬅️\n\n✅ Exclusive offers\n✅ Up-to-date information\n✅ Straight to the point content\n\n💬 If you have questions, contact support and we'll gladly help. 🤝\n\nYouTube:   <a href=\"https://www.youtube.com/@Noropayments\">CLICK HERE</a>\nTikTok:    <a href=\"https://www.tiktok.com/@noro_payments1\">CLICK HERE</a>\nWhatsApp:  <a href=\"https://api.whatsapp.com/send/?phone=573009545964&text=Hello+coming+from+Telegram&type=phone_number&app_absent=0\">CLICK HERE</a>\nTelegram:  <a href=\"https://t.me/NoroPayments\">CLICK HERE</a>\nInstagram: <a href=\"https://www.instagram.com/noropayments\">CLICK HERE</a>\n(X) Twitter: <a href=\"https://x.com/NoroPayments\">CLICK HERE</a>\n\n🔥 Follow us and don't miss anything! 🔥",
      buttons: [
        [{ label: "⬅️ Back", action: "nav:back" }, { label: "🏠 Home", action: "home:show" }],
      ],
    },
  },
  support: {
    es: {
      text: "🛠️ Soporte Noropayments.shop\n\n¿Necesitas ayuda? Estamos aquí para apoyarte 🤝\n\nEn los botones de abajo selecciona el boton con el que esta relacionado tu problema y danos una breve descripción del problema.\n\n⏳ El tiempo de respuesta puede variar según la demanda.\n🚫 El spam no esta permitido, ya que solo podras enviar 1 mensaje y tendras que esperar que soporte te responda para poder enviar otro.\n\nGracias por tu paciencia 💙",
      buttons: [
        [{ label: "🛒 Problema con una compra", action: "support:purchase" }],
        [{ label: "🐞 Reportar Error", action: "support:bug" }],
        [{ label: "⬅️ Volver", action: "nav:back" }, { label: "🏠 Inicio", action: "home:show" }],
      ],
    },
    en: {
      text: "🛠️ Noropayments.shop Support\n\nDo you need help? We're here to support you 🤝\n\nSelect the button below that matches your issue and send a brief description of the problem.\n\n⏳ Response time may vary depending on demand.\n🚫 Spam is not allowed: you can only send 1 message and must wait for support to reply before sending another.\n\nThanks for your patience 💙",
      buttons: [
        [{ label: "🛒 Problem with a purchase", action: "support:purchase" }],
        [{ label: "🐞 Report Error", action: "support:bug" }],
        [{ label: "⬅️ Back", action: "nav:back" }, { label: "🏠 Home", action: "home:show" }],
      ],
    },
  },
};

function getSectionConfig(sectionId) {
  return SECTION_OPTIONS.find((item) => item.id === sectionId) || SECTION_OPTIONS[0];
}
const LABEL_TRANSLATIONS = {
  es: {
    shop: "Tienda",
    store: "Tienda",
    methods: "Métodos",
    method: "Método",
    vip: "VIP",
    groups: "Grupos",
    group: "Grupo",
    programs: "Programas",
    program: "Programa",
    web: "Web",
    cart: "Carrito",
    affiliates: "Afiliados",
    affiliate: "Afiliado",
    community: "Comunidad",
    support: "Soporte",
    language: "Idioma",
    home: "Inicio",
    back: "Volver",
    buy: "Comprar",
    status: "Estado",
    help: "Ayuda",
    pending: "Pendientes",
    approve: "Aprobar",
    reject: "Rechazar",
    refund: "Reembolso",
    ban: "Banear",
    unban: "Desbanear",
    logs: "Logs",
    maintenance: "Mantenimiento",
    broadcast: "Broadcast",
    add: "Agregar",
    delete: "Eliminar",
    product: "Producto",
    products: "Productos",
    menu: "Menú",
    order: "Orden",
    orders: "Órdenes",
  },
  en: {
    tienda: "Shop",
    metodos: "Methods",
    método: "Method",
    metodo: "Method",
    vip: "VIP",
    grupos: "Groups",
    grupo: "Group",
    programas: "Programs",
    programa: "Program",
    web: "Web",
    carrito: "Cart",
    afiliados: "Affiliates",
    afiliado: "Affiliate",
    comunidad: "Community",
    soporte: "Support",
    idioma: "Language",
    inicio: "Home",
    volver: "Back",
    comprar: "Buy",
    estado: "Status",
    ayuda: "Help",
    pendientes: "Pending",
    aprobar: "Approve",
    rechazar: "Reject",
    reembolso: "Refund",
    banear: "Ban",
    desbanear: "Unban",
    logs: "Logs",
    mantenimiento: "Maintenance",
    difusion: "Broadcast",
    difusión: "Broadcast",
    agregar: "Add",
    eliminar: "Delete",
    producto: "Product",
    productos: "Products",
    menu: "Menu",
    menú: "Menu",
    orden: "Order",
    órdenes: "Orders",
    ordenes: "Orders",
  },
};
const PHRASE_TRANSLATIONS = {
  es: {
    "programs and web": "Programas y Web",
    "groups vip": "Grupos VIP",
  },
  en: {
    "programas y web": "Programs and Web",
    "grupos vip": "Groups VIP",
  },
};

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function withWordCase(source, target) {
  const src = String(source || "");
  const next = String(target || "");
  if (!src) {
    return next;
  }
  if (src === src.toUpperCase()) {
    return next.toUpperCase();
  }
  if (src[0] === src[0].toUpperCase()) {
    return next.charAt(0).toUpperCase() + next.slice(1);
  }
  return next;
}

function translateButtonLabel(label, fromLocale, toLocale) {
  const text = String(label || "");
  if (!text || fromLocale === toLocale) {
    return text;
  }

  const normalizedWhole = stripDiacritics(text).toLowerCase().trim();
  const phrase = PHRASE_TRANSLATIONS[toLocale]?.[normalizedWhole];
  if (phrase) {
    return phrase;
  }

  const dict = LABEL_TRANSLATIONS[toLocale] || {};
  return text
    .split(/([A-Za-zÀ-ÿ0-9]+)/g)
    .map((part) => {
      if (!part || !/[A-Za-zÀ-ÿ]/.test(part)) {
        return part;
      }
      const key = stripDiacritics(part).toLowerCase();
      const translated = dict[key];
      if (!translated) {
        return part;
      }
      return withWordCase(part, translated);
    })
    .join("");
}

function normalizeButton(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const label = String(raw.label || raw.text || "").trim().slice(0, 64);
  const action = String(raw.action || raw.callback_data || "").trim().slice(0, 64);
  const url = String(raw.url || "").trim();
  const hasUrl = Object.prototype.hasOwnProperty.call(raw, "url");
  const hasAction = Object.prototype.hasOwnProperty.call(raw, "action")
    || Object.prototype.hasOwnProperty.call(raw, "callback_data");

  if (hasUrl) {
    return { label, url };
  }
  if (hasAction) {
    return { label, action };
  }
  if (!label) {
    return null;
  }
  if (url) {
    return { label, url };
  }
  if (action) {
    return { label, action };
  }
  return { label, action: "" };
}

function normalizeRows(rawButtons) {
  if (!Array.isArray(rawButtons)) {
    return [];
  }
  const rows = [];
  for (const rawRow of rawButtons) {
    if (Array.isArray(rawRow)) {
      const parsedRow = rawRow
        .map((item) => normalizeButton(item))
        .filter(Boolean)
        .slice(0, 2);
      if (parsedRow.length > 0) {
        rows.push(parsedRow);
      }
      continue;
    }
    const parsed = normalizeButton(rawRow);
    if (!parsed) {
      continue;
    }
    if (rows.length === 0 || rows[rows.length - 1].length >= 2) {
      rows.push([parsed]);
    } else {
      rows[rows.length - 1].push(parsed);
    }
  }
  return rows;
}

function normalizeLayout(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const layout = {};
  for (const locale of LOCALES) {
    const localized = source[locale] && typeof source[locale] === "object"
      ? source[locale]
      : {};
    layout[locale] = {
      text: String(localized.text || ""),
      buttons: normalizeRows(localized.buttons),
    };
  }
  return layout;
}

function applySectionLayoutDefaults(sectionId, parsedLayout) {
  const sectionDefaults = SECTION_DEFAULT_LAYOUTS[sectionId];
  if (!sectionDefaults) {
    return parsedLayout;
  }
  const next = cloneLayout(parsedLayout);
  for (const locale of LOCALES) {
    const defaults = sectionDefaults?.[locale];
    if (!defaults) {
      continue;
    }
    if (!String(next[locale].text || "").trim()) {
      next[locale].text = String(defaults.text || "");
    }
    if (!Array.isArray(next[locale].buttons) || next[locale].buttons.length === 0) {
      next[locale].buttons = normalizeRows(defaults.buttons);
    }
  }
  return next;
}

function cloneLayout(layout) {
  return normalizeLayout(JSON.parse(JSON.stringify(layout || {})));
}

function countButtons(rows) {
  return (rows || []).reduce((sum, row) => sum + row.length, 0);
}

function getButtonType(button) {
  return button && Object.prototype.hasOwnProperty.call(button, "url")
    ? "url"
    : "callback";
}

function buttonTarget(button) {
  if (getButtonType(button) === "url") {
    return String(button?.url || "");
  }
  return String(button?.action || "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markdownToEditorHtml(raw) {
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
}

function normalizeMessageForSave(html) {
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
}

function findClosestTag(node, tagName) {
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
}

function findSelectedContainer(snapshot, tagName) {
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
}

function unwrapElement(node) {
  if (!node || !node.parentNode) {
    return;
  }
  const parent = node.parentNode;
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}

function validateLayout(layout) {
  for (const locale of LOCALES) {
    const localized = layout?.[locale] || {};
    const rows = Array.isArray(localized.buttons) ? localized.buttons : [];
    if (countButtons(rows) > MAX_BUTTONS) {
      return `El idioma ${locale.toUpperCase()} supera el limite de ${MAX_BUTTONS} botones.`;
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      if (row.length > 2) {
        return `La fila ${rowIndex + 1} en ${locale.toUpperCase()} no puede tener mas de 2 botones.`;
      }
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        const button = row[colIndex];
        const label = String(button?.label || "").trim();
        if (!label) {
          return `Falta texto en ${locale.toUpperCase()} fila ${rowIndex + 1} boton ${colIndex + 1}.`;
        }
        const type = getButtonType(button);
        const target = String(buttonTarget(button) || "").trim();
        if (!target) {
          return `Falta destino en ${locale.toUpperCase()} fila ${rowIndex + 1} boton ${colIndex + 1}.`;
        }
        if (type === "url" && !/^https?:\/\//i.test(target)) {
          return `La URL debe iniciar con http:// o https:// (${locale.toUpperCase()} fila ${rowIndex + 1}).`;
        }
      }
    }
  }
  return "";
}

function localeTitle(locale) {
  return locale === "en" ? "English" : "Español";
}

export default function HomeMenuPage() {
  const router = useRouter();
  const homeTextEditorRef = useRef(null);
  const homeLinkSelectionRef = useRef(null);
  const [activeSection, setActiveSection] = useState("home");
  const [editorSyncNonce, setEditorSyncNonce] = useState(0);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkModalText, setLinkModalText] = useState("");
  const [linkModalUrl, setLinkModalUrl] = useState("https://");
  const [linkModalError, setLinkModalError] = useState("");
  const [layout, setLayout] = useState(() => normalizeLayout({}));
  const [draft, setDraft] = useState(() => normalizeLayout({}));
  const [activeLocale, setActiveLocale] = useState("es");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const sectionConfig = useMemo(
    () => getSectionConfig(activeSection),
    [activeSection]
  );
  const hasChanges = useMemo(
    () => JSON.stringify(layout) !== JSON.stringify(draft),
    [layout, draft]
  );

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadLayout = useCallback(async ({ silent = false, sectionId = activeSection } = {}) => {
    const targetSection = getSectionConfig(sectionId);
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await apiFetch(`/admin/layouts/${targetSection.layoutKey}`);
      const rawLayout = data?.layout && typeof data.layout === "object" ? data.layout : {};
      const normalized = applySectionLayoutDefaults(sectionId, normalizeLayout(rawLayout));
      setLayout(normalized);
      setDraft(cloneLayout(normalized));
      setEditorSyncNonce((prev) => prev + 1);
      setError("");
      setToast("");
      setLastSyncAt(Date.now());
    } catch (err) {
      setError(`No se pudo cargar la sección ${targetSection.label}.`);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [activeSection]);

  useEffect(() => {
    loadLayout({ sectionId: activeSection });
  }, [activeSection, loadLayout]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!hasChanges && !saving) {
        loadLayout({ silent: true, sectionId: activeSection });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [activeSection, hasChanges, loadLayout, saving]);

  const totalButtons = useMemo(() => {
    return LOCALES.reduce((sum, locale) => {
      const rows = draft?.[locale]?.buttons || [];
      return sum + rows.reduce((rowsSum, row) => rowsSum + row.length, 0);
    }, 0);
  }, [draft]);

  const updateLocaleText = useCallback((locale, value) => {
    setDraft((prev) => {
      const next = cloneLayout(prev);
      next[locale].text = value;
      return next;
    });
  }, []);

  useEffect(() => {
    const editor = homeTextEditorRef.current;
    if (!editor) {
      return;
    }
    const source = draft?.[activeLocale]?.text || "";
    const html = markdownToEditorHtml(source);
    if ((editor.innerHTML || "") !== html) {
      editor.innerHTML = html;
    }
  }, [activeLocale, editorSyncNonce]);

  const syncLocaleTextFromEditor = useCallback(() => {
    const editor = homeTextEditorRef.current;
    if (!editor) {
      return;
    }
    const normalized = normalizeMessageForSave(editor.innerHTML || "");
    updateLocaleText(activeLocale, normalized);
  }, [activeLocale, updateLocaleText]);

  const getEditorSelection = useCallback(() => {
    const editor = homeTextEditorRef.current;
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

  const requireEditorSelection = useCallback(
    (errorMessage = "Selecciona texto para aplicar formato.") => {
      const snapshot = getEditorSelection();
      if (!snapshot || snapshot.range.collapsed || !snapshot.text.trim()) {
        setError(errorMessage);
        return null;
      }
      setError("");
      return snapshot;
    },
    [getEditorSelection]
  );

  const runEditorCommand = useCallback((command, value = null, options = {}) => {
    const { requiresSelection = true, selectionError = "Selecciona texto para aplicar formato." } = options;
    if (requiresSelection && !requireEditorSelection(selectionError)) {
      return false;
    }
    const editor = homeTextEditorRef.current;
    if (!editor) {
      return false;
    }
    editor.focus();
    document.execCommand(command, false, value);
    syncLocaleTextFromEditor();
    setError("");
    return true;
  }, [requireEditorSelection, syncLocaleTextFromEditor]);

  const openLinkModal = useCallback(() => {
    const snapshot = requireEditorSelection("Selecciona el texto para crear el enlace.");
    if (!snapshot) {
      return;
    }
    homeLinkSelectionRef.current = snapshot.range.cloneRange();
    const anchor = findClosestTag(snapshot.selection.anchorNode, "a")
      || findClosestTag(snapshot.selection.focusNode, "a");
    const currentUrl = String(anchor?.getAttribute("href") || "").trim();
    setLinkModalText(snapshot.text.trim());
    setLinkModalUrl(/^https?:\/\//i.test(currentUrl) ? currentUrl : "https://");
    setLinkModalError("");
    setIsLinkModalOpen(true);
  }, [requireEditorSelection]);

  const closeLinkModal = useCallback(() => {
    setIsLinkModalOpen(false);
    setLinkModalError("");
    homeLinkSelectionRef.current = null;
    const editor = homeTextEditorRef.current;
    if (editor) {
      editor.focus();
    }
  }, []);

  const submitLinkModal = useCallback(() => {
    const text = String(linkModalText || "").trim();
    const href = String(linkModalUrl || "").trim();
    if (!text) {
      setLinkModalError("Escribe el texto del enlace.");
      return;
    }
    if (!/^https?:\/\//i.test(href)) {
      setLinkModalError("El enlace debe iniciar por http:// o https://");
      return;
    }
    const editor = homeTextEditorRef.current;
    const savedRange = homeLinkSelectionRef.current;
    if (!editor || !savedRange) {
      setLinkModalError("Selecciona el texto nuevamente.");
      return;
    }
    editor.focus();
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    runEditorCommand(
      "insertHTML",
      `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`,
      { requiresSelection: false }
    );
    setIsLinkModalOpen(false);
    setLinkModalError("");
    homeLinkSelectionRef.current = null;
  }, [linkModalText, linkModalUrl, runEditorCommand]);

  const preventToolbarBlur = useCallback((event) => {
    event.preventDefault();
  }, []);

  const mirrorButtonsFromLocale = useCallback((nextLayout, sourceLocale) => {
    const sourceRows = nextLayout?.[sourceLocale]?.buttons || [];
    for (const targetLocale of LOCALES) {
      if (targetLocale === sourceLocale) {
        continue;
      }
      nextLayout[targetLocale].buttons = sourceRows.map((sourceRow) =>
        sourceRow.map((sourceButton) => {
          const translatedLabel = translateButtonLabel(
            sourceButton?.label || "",
            sourceLocale,
            targetLocale
          );
          if (getButtonType(sourceButton) === "url") {
            return {
              label: translatedLabel,
              url: String(sourceButton?.url || ""),
            };
          }
          return {
            label: translatedLabel,
            action: String(sourceButton?.action || ""),
          };
        })
      );
    }
    return nextLayout;
  }, []);

  const toggleMonespaced = useCallback(() => {
    const snapshot = requireEditorSelection();
    if (!snapshot) {
      return;
    }
    const { selection } = snapshot;
    const anchorNode = selection.anchorNode;
    const codeNode = findClosestTag(anchorNode, "code");
    const preNode = findClosestTag(anchorNode, "pre");

    if (codeNode && !preNode) {
      unwrapElement(codeNode);
      syncLocaleTextFromEditor();
      return;
    }
    if (preNode) {
      unwrapElement(preNode);
      syncLocaleTextFromEditor();
      return;
    }

    const selected = snapshot.text;
    if (selected.includes("\n")) {
      runEditorCommand("formatBlock", "pre");
    } else {
      runEditorCommand("insertHTML", `<code>${escapeHtml(selected)}</code>`);
    }
  }, [requireEditorSelection, runEditorCommand, syncLocaleTextFromEditor]);

  const insertQuoteStyle = useCallback(() => {
    const snapshot = requireEditorSelection("Selecciona el texto para citar.");
    if (!snapshot) {
      return;
    }
    const quoteNode = findSelectedContainer(snapshot, "blockquote");
    if (quoteNode) {
      unwrapElement(quoteNode);
      syncLocaleTextFromEditor();
      return;
    }
    const selected = escapeHtml(snapshot.text || "");
    const html = `<blockquote>${selected}</blockquote>`;
    runEditorCommand("insertHTML", html, { requiresSelection: false });
  }, [requireEditorSelection, runEditorCommand, syncLocaleTextFromEditor]);

  const insertShellCodeStyle = useCallback(() => {
    const snapshot = requireEditorSelection("Selecciona el texto para formatear como código.");
    if (!snapshot) {
      return;
    }
    const preNode = findSelectedContainer(snapshot, "pre");
    if (preNode) {
      unwrapElement(preNode);
      syncLocaleTextFromEditor();
      return;
    }
    const codeNode = findSelectedContainer(snapshot, "code");
    if (codeNode && !findClosestTag(codeNode.parentNode, "pre")) {
      unwrapElement(codeNode);
      syncLocaleTextFromEditor();
      return;
    }
    const selected = escapeHtml(snapshot.text || "");
    const html = `<pre>${selected}</pre>`;
    runEditorCommand("insertHTML", html, { requiresSelection: false });
  }, [requireEditorSelection, runEditorCommand, syncLocaleTextFromEditor]);

  const handleEditorKeyDown = useCallback((event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) {
      return;
    }
    const key = String(event.key || "").toLowerCase();
    const withShift = Boolean(event.shiftKey);

    if (key === "b" && !withShift) {
      event.preventDefault();
      runEditorCommand("bold");
      return;
    }
    if (key === "i" && !withShift) {
      event.preventDefault();
      runEditorCommand("italic");
      return;
    }
    if (key === "u" && !withShift) {
      event.preventDefault();
      runEditorCommand("underline");
      return;
    }
    if (key === "k" && !withShift) {
      event.preventDefault();
      openLinkModal();
      return;
    }
    if (key === "x" && withShift) {
      event.preventDefault();
      runEditorCommand("strikeThrough");
      return;
    }
    if (key === "." && withShift) {
      event.preventDefault();
      insertQuoteStyle();
      return;
    }
    if (key === "c" && withShift) {
      event.preventDefault();
      insertShellCodeStyle();
      return;
    }
    if (key === "m" && withShift) {
      event.preventDefault();
      toggleMonespaced();
    }
  }, [insertQuoteStyle, insertShellCodeStyle, openLinkModal, runEditorCommand, toggleMonespaced]);

  const handleEditorPaste = useCallback((event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    syncLocaleTextFromEditor();
  }, [syncLocaleTextFromEditor]);

  const updateButtonField = (locale, rowIndex, colIndex, field, value) => {
    setDraft((prev) => {
      const next = cloneLayout(prev);
      const row = next?.[locale]?.buttons?.[rowIndex];
      if (!row || !row[colIndex]) {
        return prev;
      }
      if (field === "type") {
        const previous = row[colIndex];
        row[colIndex] = value === "url"
          ? { label: previous.label || "", url: previous.url || "" }
          : { label: previous.label || "", action: previous.action || "" };
        return mirrorButtonsFromLocale(next, locale);
      }
      if (field === "label") {
        row[colIndex].label = String(value || "").slice(0, 64);
        return mirrorButtonsFromLocale(next, locale);
      }
      if (field === "target") {
        if (getButtonType(row[colIndex]) === "url") {
          row[colIndex] = {
            label: row[colIndex].label || "",
            url: String(value || "").trim(),
          };
        } else {
          row[colIndex] = {
            label: row[colIndex].label || "",
            action: String(value || "").slice(0, 64),
          };
        }
        return mirrorButtonsFromLocale(next, locale);
      }
      return prev;
    });
  };

  const addRow = (locale) => {
    setDraft((prev) => {
      const next = cloneLayout(prev);
      const currentRows = next?.[locale]?.buttons || [];
      if (countButtons(currentRows) >= MAX_BUTTONS) {
        setError(`Limite de ${MAX_BUTTONS} botones alcanzado.`);
        return prev;
      }
      currentRows.push([{ label: "Nuevo botón", action: "home:soon:nuevo" }]);
      next[locale].buttons = currentRows;
      return mirrorButtonsFromLocale(next, locale);
    });
  };

  const addButtonInRow = (locale, rowIndex) => {
    setDraft((prev) => {
      const next = cloneLayout(prev);
      const currentRows = next?.[locale]?.buttons || [];
      if (countButtons(currentRows) >= MAX_BUTTONS) {
        setError(`Limite de ${MAX_BUTTONS} botones alcanzado.`);
        return prev;
      }
      const row = currentRows[rowIndex];
      if (!row) {
        return prev;
      }
      if (row.length >= 2) {
        setError("Esa fila ya tiene 2 botones.");
        return prev;
      }
      row.push({ label: "Nuevo botón", action: "home:soon:nuevo" });
      return mirrorButtonsFromLocale(next, locale);
    });
  };

  const deleteButton = (locale, rowIndex, colIndex) => {
    setDraft((prev) => {
      const next = cloneLayout(prev);
      const row = next?.[locale]?.buttons?.[rowIndex];
      if (!row) {
        return prev;
      }
      row.splice(colIndex, 1);
      next[locale].buttons = (next[locale].buttons || []).filter((entry) => entry.length > 0);
      return mirrorButtonsFromLocale(next, locale);
    });
  };

  const moveRow = (locale, rowIndex, direction) => {
    setDraft((prev) => {
      const next = cloneLayout(prev);
      const rows = next?.[locale]?.buttons || [];
      const target = direction === "up" ? rowIndex - 1 : rowIndex + 1;
      if (target < 0 || target >= rows.length) {
        return prev;
      }
      const temp = rows[target];
      rows[target] = rows[rowIndex];
      rows[rowIndex] = temp;
      next[locale].buttons = rows;
      return mirrorButtonsFromLocale(next, locale);
    });
  };

  const deleteRow = (locale, rowIndex) => {
    setDraft((prev) => {
      const next = cloneLayout(prev);
      next[locale].buttons.splice(rowIndex, 1);
      return mirrorButtonsFromLocale(next, locale);
    });
  };

  const saveLayout = async () => {
    const nextLayout = cloneLayout(draft);
    const editor = homeTextEditorRef.current;
    if (editor) {
      nextLayout[activeLocale].text = normalizeMessageForSave(editor.innerHTML || "");
    }
    mirrorButtonsFromLocale(nextLayout, activeLocale);
    setDraft(cloneLayout(nextLayout));
    const normalizedPayload = normalizeLayout(nextLayout);
    const validationError = validateLayout(normalizedPayload);
    if (validationError) {
      setError(validationError);
      setToast("");
      return;
    }
    setSaving(true);
    setError("");
    setToast("");
    try {
      const data = await apiFetch(`/admin/layouts/${sectionConfig.layoutKey}`, {
        method: "POST",
        body: JSON.stringify(normalizedPayload),
      });
      const normalized = normalizeLayout(data?.layout);
      setLayout(normalized);
      setDraft(cloneLayout(normalized));
      setLastSyncAt(Date.now());
      setToast("Cambios guardados correctamente.");
    } catch (err) {
      setError(`No se pudo guardar la sección ${sectionConfig.label}.`);
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    setDraft(cloneLayout(layout));
    setEditorSyncNonce((prev) => prev + 1);
    setError("");
    setToast("");
  };

  const handleLocaleChange = (locale) => {
    syncLocaleTextFromEditor();
    setActiveLocale(locale);
    setEditorSyncNonce((prev) => prev + 1);
  };

  const handleSectionChange = (sectionId) => {
    if (sectionId === activeSection) {
      return;
    }
    syncLocaleTextFromEditor();
    setActiveLocale("es");
    setActiveSection(sectionId);
  };

  const activeLocalized = draft?.[activeLocale] || { text: "", buttons: [] };
  const rows = activeLocalized.buttons || [];

  return (
    <main className="page home-menu-page">
      <section className="card home-menu-card">
        <div className="inventory-header home-menu-header">
          <div>
            <h1>Home Bot (Editor)</h1>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <>
          <div className="category-grid home-menu-section-grid">
            {SECTION_OPTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`category-button ${activeSection === section.id ? "active" : ""}`}
                onClick={() => handleSectionChange(section.id)}
              >
                <span>{section.label}</span>
              </button>
            ))}
          </div>
          <div className="home-menu-locale-row">
            <div className="category-grid home-menu-locale-grid">
              {LOCALES.map((locale) => (
                <button
                  key={locale}
                  type="button"
                  className={`category-button ${activeLocale === locale ? "active" : ""}`}
                  onClick={() => handleLocaleChange(locale)}
                >
                  <span>{localeTitle(locale)}</span>
                  <span className="category-count">{draft?.[locale]?.buttons?.length || 0}</span>
                </button>
              ))}
            </div>
          </div>
          <section className="card home-menu-locale-card">
              <div className="inventory-header home-menu-locale-header">
                <div>
                  <h3>{sectionConfig.label}: {localeTitle(activeLocale)} ({activeLocale.toUpperCase()})</h3>
                  <p className="muted">Edita texto y botones de este idioma.</p>
                </div>
              </div>
              <div className="home-menu-text-label">
                <p className="home-menu-text-title">Texto Home</p>
                <div className="home-message-toolbar">
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("bold")}>Negrita</button>
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("italic")}>Cursiva</button>
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("underline")}>Subrayado</button>
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={openLinkModal}>Enlace</button>
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("strikeThrough")}>Tachado</button>
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={insertQuoteStyle}>Citar</button>
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={insertShellCodeStyle}>Codigo</button>
                  <button type="button" className="ghost" onMouseDown={preventToolbarBlur} onClick={toggleMonespaced}>Monoespaciado</button>
                </div>
                <div
                  ref={homeTextEditorRef}
                  className="broadcast-message-editor home-message-editor"
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label="Texto Home"
                  onInput={syncLocaleTextFromEditor}
                  onKeyDown={handleEditorKeyDown}
                  onPaste={handleEditorPaste}
                />
                <p className="muted home-menu-sync-inline">
                  Ultima actualizacion:{" "}
                  {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "-"} · Botones detectados: {totalButtons}/{MAX_BUTTONS}
                  {hasChanges ? " · Cambios pendientes" : ""}
                </p>
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
                <div className="actions home-menu-header-actions home-menu-editor-actions">
                  <button type="button" onClick={() => loadLayout()} disabled={loading || saving}>
                    {loading ? "Cargando..." : "Actualizar"}
                  </button>
                  <button type="button" className="ghost" onClick={resetDraft} disabled={!hasChanges || saving}>
                    Restaurar
                  </button>
                  <button type="button" onClick={saveLayout} disabled={!hasChanges || saving}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
                <div className="actions home-menu-add-row-actions">
                  <button type="button" onClick={() => addRow(activeLocale)}>
                    Agregar fila
                  </button>
                </div>
              </div>
              {rows.length === 0 ? (
                <p className="muted">Sin botones. Agrega una fila para empezar.</p>
              ) : (
                <div className="home-menu-rows">
                  {rows.map((row, rowIndex) => (
                    <div
                      key={`row-${activeLocale}-${rowIndex}`}
                      className="card home-menu-row"
                    >
                      <div className="inventory-header home-menu-row-header">
                        <div>
                          <strong>Fila {rowIndex + 1}</strong>
                        </div>
                        <div className="actions home-menu-row-actions">
                          <button type="button" className="ghost" onClick={() => moveRow(activeLocale, rowIndex, "up")}>
                            Subir
                          </button>
                          <button type="button" className="ghost" onClick={() => moveRow(activeLocale, rowIndex, "down")}>
                            Bajar
                          </button>
                          {row.length < 2 && (
                            <button type="button" onClick={() => addButtonInRow(activeLocale, rowIndex)}>
                              Agregar en fila
                            </button>
                          )}
                          <button type="button" className="delete-button" onClick={() => deleteRow(activeLocale, rowIndex)}>
                            Eliminar fila
                          </button>
                        </div>
                      </div>
                      <div className="home-menu-row-buttons">
                        {row.map((button, colIndex) => (
                          <div key={`btn-${rowIndex}-${colIndex}`} className="home-menu-button-card">
                            <p className="muted home-menu-button-title">
                              Boton {colIndex + 1}
                            </p>
                            <label className="home-menu-button-field">
                              Texto
                              <input
                                type="text"
                                value={button.label || ""}
                                onChange={(event) =>
                                  updateButtonField(activeLocale, rowIndex, colIndex, "label", event.target.value)
                                }
                              />
                            </label>
                            <label className="home-menu-button-field">
                              Tipo
                              <select
                                value={getButtonType(button)}
                                onChange={(event) =>
                                  updateButtonField(activeLocale, rowIndex, colIndex, "type", event.target.value)
                                }
                              >
                                <option value="callback">callback_data</option>
                                <option value="url">URL</option>
                              </select>
                            </label>
                            <label className="home-menu-button-field">
                              Destino
                              <input
                                type="text"
                                value={buttonTarget(button)}
                                onChange={(event) =>
                                  updateButtonField(activeLocale, rowIndex, colIndex, "target", event.target.value)
                                }
                                placeholder={getButtonType(button) === "url" ? "https://..." : "category:page:metodos"}
                              />
                            </label>
                            <div className="actions home-menu-button-actions">
                              <button
                                type="button"
                                className="delete-button"
                                onClick={() => deleteButton(activeLocale, rowIndex, colIndex)}
                              >
                                Eliminar boton
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </section>
        </>
      </section>
      {isLinkModalOpen && (
        <div
          className="editor-link-overlay"
          role="button"
          tabIndex={0}
          onClick={closeLinkModal}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeLinkModal();
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
            {linkModalError && <p className="error">{linkModalError}</p>}
            <label>
              Texto
              <input
                type="text"
                value={linkModalText}
                onChange={(event) => setLinkModalText(event.target.value)}
              />
            </label>
            <label>
              URL
              <input
                type="url"
                value={linkModalUrl}
                onChange={(event) => setLinkModalUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <div className="actions editor-link-actions">
              <button type="button" className="ghost" onClick={closeLinkModal}>
                Cancelar
              </button>
              <button type="button" onClick={submitLinkModal}>
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
