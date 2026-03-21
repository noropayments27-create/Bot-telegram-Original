import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

import Layout from "../components/Layout";
import { reportAdminAppError } from "../lib/api";
import "../styles/globals.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "../styles/responsive.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const faviconVersion = String(process.env.NEXT_PUBLIC_FAVICON_VERSION || "1");
  const faviconPngHref = `/favicon-noropayments.png?v=${encodeURIComponent(faviconVersion)}`;
  const useLayout = (
    router.pathname !== "/login"
    && router.pathname !== "/telegram-access"
    && router.pathname !== "/telegram-login"
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    const storageKey = `admin_scroll_${router.asPath}`;
    let ticking = false;
    const saveScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        window.sessionStorage.setItem(
          storageKey,
          String(window.scrollY || 0)
        );
        ticking = false;
      });
    };
    const saved = Number(window.sessionStorage.getItem(storageKey) || 0);
    if (Number.isFinite(saved) && saved > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, saved);
      });
    }
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("beforeunload", saveScroll);
    return () => {
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("beforeunload", saveScroll);
    };
  }, [router.asPath]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleWindowError = (event) => {
      reportAdminAppError({
        code: "WINDOW_ERROR",
        route: window.location.pathname,
        message: event?.message || "Unhandled window error",
        stack: event?.error?.stack || undefined,
        context: {
          filename: event?.filename || null,
          lineno: event?.lineno || null,
          colno: event?.colno || null,
        },
      });
    };

    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      reportAdminAppError({
        code: "UNHANDLED_REJECTION",
        route: window.location.pathname,
        message:
          (reason && typeof reason === "object" && reason.message)
          || String(reason || "Unhandled promise rejection"),
        stack:
          (reason && typeof reason === "object" && reason.stack)
          || undefined,
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const applyNativeButtonTooltips = () => {
      const targets = document.querySelectorAll(
        "button:not([title]), a.link-button:not([title]), [role='button']:not([title])"
      );
      targets.forEach((node) => {
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        const ariaLabel = node.getAttribute("aria-label") || "";
        const dataTooltip = node.getAttribute("data-tooltip") || "";
        const tooltip = (dataTooltip || ariaLabel || text).trim();
        if (!tooltip) {
          return;
        }
        if (tooltip.length > 120) {
          return;
        }
        node.setAttribute("title", tooltip);
      });
    };

    applyNativeButtonTooltips();
    const observer = new MutationObserver(() => {
      applyNativeButtonTooltips();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [router.asPath]);

  const faviconHead = (
    <Head>
      <link rel="icon" type="image/png" href={faviconPngHref} />
      <link rel="shortcut icon" type="image/png" href={faviconPngHref} />
      <link rel="apple-touch-icon" href={faviconPngHref} />
    </Head>
  );

  if (!useLayout) {
    return (
      <>
        {faviconHead}
        <Component {...pageProps} />
      </>
    );
  }

  return (
    <>
      {faviconHead}
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </>
  );
}
