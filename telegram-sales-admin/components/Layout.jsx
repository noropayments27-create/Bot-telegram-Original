import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import styles from "../styles/Layout.module.css";

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setOpen(false);
  }, [router.pathname]);

  return (
    <div className={styles.layout}>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <TopBar onMenu={() => setOpen(true)} />
      {open && <div className={styles.overlay} onClick={() => setOpen(false)} />}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
