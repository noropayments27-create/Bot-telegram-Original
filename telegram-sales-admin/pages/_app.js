import { useEffect } from "react";
import { useRouter } from "next/router";

import Layout from "../components/Layout";
import "../styles/globals.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

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

  if (!useLayout) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
