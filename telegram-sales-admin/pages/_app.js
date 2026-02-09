import { useEffect } from "react";
import { useRouter } from "next/router";

import Layout from "../components/Layout";
import "../styles/globals.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "../styles/responsive.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
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

  if (!useLayout) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
