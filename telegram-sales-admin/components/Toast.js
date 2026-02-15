function classifyToast(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (!text) {
    return "positive";
  }

  if (text.includes("❌") || text.includes("⛔") || text.includes("🚫")) {
    return "negative";
  }
  if (text.includes("✅")) {
    return "positive";
  }

  const negativePatterns = [
    "no se pudo",
    "no pudo",
    "error",
    "incorrect",
    "rechaz",
    "deneg",
    "inval",
    "invál",
    "fall",
    "failed",
    "denied",
    "bloque",
    "sin ",
    "no hay",
  ];
  if (negativePatterns.some((pattern) => lower.includes(pattern))) {
    return "negative";
  }

  return "positive";
}

export default function Toast({ message }) {
  if (!message) {
    return null;
  }

  const tone = classifyToast(message);
  const isNegative = tone === "negative";

  return (
    <div className={`toast toast--${tone}`} role="status" aria-live="polite">
      <span className="toast__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          {isNegative ? (
            <path
              d="M9 9l6 6M15 9l-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M8 12.5l2.6 2.6L16 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>
      <span>{message}</span>
    </div>
  );
}
