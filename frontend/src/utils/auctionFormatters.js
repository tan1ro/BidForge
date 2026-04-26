export const TRIGGER_LABELS = {
  bid_received: "Bid received in trigger window",
  rank_change: "Any supplier rank change",
  l1_change: "L1 rank change only",
};

export const STATUS_LABELS = {
  upcoming: "Upcoming",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
  force_closed: "Force closed",
};

export const TERMINAL_STATUSES = new Set(["closed", "force_closed"]);

export function toLocalDateTimeInputValue(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatCurrency(val) {
  if (val == null) return "—";
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function openFileLink(url, fileName) {
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.click();
}

export function getTimeRemaining(targetDate, nowMs = Date.now()) {
  const diff = new Date(targetDate).getTime() - nowMs;
  if (diff <= 0) return { expired: true, text: "Expired" };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return {
    expired: false,
    urgent: diff < 5 * 60 * 1000,
    text: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
  };
}
