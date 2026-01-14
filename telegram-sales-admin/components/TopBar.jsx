import styles from "../styles/TopBar.module.css";
import NotificationsBell from "./NotificationsBell";

export default function TopBar({ onMenu }) {
  return (
    <div className={styles.topBar}>
      <button type="button" className={styles.menuButton} onClick={onMenu}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className={styles.title}>Admin</div>
      <NotificationsBell variant="topbar" />
    </div>
  );
}
