function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function entityHref(type, id) {
  return `/profile.html?type=${encodeURIComponent(String(type ?? ""))}&id=${encodeURIComponent(String(id ?? ""))}`;
}

export function entityLink(type, id, label, options = {}) {
  if (!type || !id) return escapeHtml(label ?? id ?? "—");
  const className = ["entity-link", options.className].filter(Boolean).join(" ");
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(entityHref(type, id))}">${escapeHtml(label ?? id)}</a>`;
}
