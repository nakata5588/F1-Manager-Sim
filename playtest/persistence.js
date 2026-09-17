import { CAREER_ENTRY_STORAGE_KEY } from "/main-menu-model.js";

function escapeText(value) {
  return String(value ?? "").replaceAll("\n", " ").trim();
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload;
}

function formatSlot(row) {
  const date = row.date ?? "unknown date";
  const manager = row.managerName ?? "Manager";
  const race = row.liveRace?.status && row.liveRace.status !== "completed"
    ? ` · race L${row.liveRace.currentLap ?? 0}/${row.liveRace.totalLaps ?? "?"}`
    : "";
  return `${row.slot} — ${manager} · ${date}${race}`;
}

async function chooseLoadSlot() {
  const payload = await request("/api/saves");
  const slots = (payload.slots ?? []).filter((row) => !row.invalid && row.compatible !== false);
  if (!slots.length) throw new Error("No valid save slots are available.");
  const suggested = slots[0].slot;
  const choice = window.prompt(`Load which save slot?\n\n${slots.map(formatSlot).join("\n")}`, suggested);
  return choice?.trim() || null;
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .persistence-dock{position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;gap:8px;padding:8px;border-radius:10px;background:rgba(11,15,20,.92);box-shadow:0 8px 30px rgba(0,0,0,.35);backdrop-filter:blur(8px)}
    .persistence-dock button{border:1px solid rgba(255,255,255,.18);background:#171d25;color:#fff;padding:9px 12px;border-radius:7px;font:700 12px/1 system-ui;letter-spacing:.04em;cursor:pointer}
    .persistence-dock button:hover{background:#252e3a}.persistence-dock button:disabled{opacity:.45;cursor:not-allowed}
    .persistence-status{position:fixed;right:18px;bottom:72px;z-index:9999;max-width:360px;padding:8px 10px;border-radius:7px;background:rgba(11,15,20,.92);color:#d9e2ec;font:12px/1.35 system-ui;opacity:0;transform:translateY(5px);transition:.18s;pointer-events:none}
    .persistence-status.show{opacity:1;transform:none}
  `;
  document.head.append(style);
}

function showStatus(node, message) {
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2600);
}

async function installPersistenceDock() {
  installStyles();
  const status = document.createElement("div");
  status.className = "persistence-status";
  const dock = document.createElement("div");
  dock.className = "persistence-dock";
  dock.innerHTML = '<button type="button" data-save> SAVE </button><button type="button" data-load> LOAD </button>';
  document.body.append(status, dock);

  const saveButton = dock.querySelector("[data-save]");
  const loadButton = dock.querySelector("[data-load]");

  try {
    const current = await request("/api/state");
    saveButton.disabled = current.screen === "new_career";
  } catch {
    saveButton.disabled = true;
  }

  saveButton.addEventListener("click", async () => {
    try {
      const slot = window.prompt("Save slot name", "manual-1")?.trim();
      if (!slot) return;
      const payload = await request("/api/saves", { method: "POST", body: JSON.stringify({ slot }) });
      showStatus(status, `Saved ${escapeText(payload.save?.slot ?? slot)}.`);
    } catch (error) {
      window.alert(error.message);
    }
  });

  loadButton.addEventListener("click", async () => {
    try {
      const slot = await chooseLoadSlot();
      if (!slot) return;
      await request("/api/saves/load", { method: "POST", body: JSON.stringify({ slot }) });
      sessionStorage.setItem(CAREER_ENTRY_STORAGE_KEY, "1");
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  });
}

if (sessionStorage.getItem(CAREER_ENTRY_STORAGE_KEY) === "1") installPersistenceDock();