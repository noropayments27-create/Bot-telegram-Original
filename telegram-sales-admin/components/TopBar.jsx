import styles from "../styles/TopBar.module.css";
import NotificationsBell from "./NotificationsBell";

export default function TopBar({ onMenu, sidebarOpen = false }) {
  return (
    <div className={styles.topBar}>
      <button type="button" className={styles.menuButton} onClick={onMenu}>
        <span className={styles.menuLine} />
        <span className={styles.menuLine} />
        <span className={styles.menuLine} />
      </button>
      <div className={styles.title}>Panel Administrativo</div>
      <div className={styles.rightSlot}>
        {!sidebarOpen && <NotificationsBell variant="topbar" />}
      </div>
    </div>
  );
}
