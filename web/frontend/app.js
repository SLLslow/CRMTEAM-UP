const API_BASE = window.location.hostname === "localhost" ? "http://localhost:8080" : "https://crmteamlid-backend.onrender.com";

const state = {
  agreements: [],
  summary: null,
  autoSyncTimer: null
};

const els = {
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    exchange: document.getElementById("exchange"),
    data: document.getElementById("data"),
    settings: document.getElementById("settings")
  },
  token: document.getElementById("token"),
  from: document.getElementById("from"),
  to: document.getElementById("to"),
  sync: document.getElementById("sync"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  summary: document.getElementById("summary"),
  managerRows: document.getElementById("managerRows"),
  managerDeals: document.getElementById("managerDeals"),
  theme: document.getElementById("theme"),
  opacity: document.getElementById("opacity"),
  opacityValue: document.getElementById("opacityValue"),
  autosync: document.getElementById("autosync"),
  notify: document.getElementById("notify")
};

init();

function init() {
  const now = new Date();
  const before = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  els.from.value = toDateInput(before);
  els.to.value = toDateInput(now);

  els.token.value = localStorage.getItem("crm_token") || "";
  els.theme.value = localStorage.getItem("crm_theme") || "system";
  els.opacity.value = localStorage.getItem("crm_panel_opacity") || "90";
  els.autosync.value = localStorage.getItem("crm_autosync") || "0";
  els.notify.checked = localStorage.getItem("crm_notify") === "1";

  applyTheme();
  applyOpacity();
  setupAutosync();

  els.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  els.sync.addEventListener("click", syncNow);

  els.theme.addEventListener("change", () => {
    localStorage.setItem("crm_theme", els.theme.value);
    applyTheme();
    applyOpacity();
  });

  els.opacity.addEventListener("input", () => {
    localStorage.setItem("crm_panel_opacity", els.opacity.value);
    applyOpacity();
  });

  els.autosync.addEventListener("change", () => {
    localStorage.setItem("crm_autosync", els.autosync.value);
    setupAutosync();
  });

  els.notify.addEventListener("change", async () => {
    localStorage.setItem("crm_notify", els.notify.checked ? "1" : "0");
    if (els.notify.checked && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  });
}

function switchTab(tab) {
  els.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  Object.entries(els.panels).forEach(([key, node]) => {
    node.classList.toggle("hidden", key !== tab);
  });
}

function selectedManagerIds() {
  return [...document.querySelectorAll(".mgr:checked")].map((el) => Number(el.value));
}

async function syncNow() {
  const token = els.token.value.trim();
  if (!token) {
    setError("Вкажи токен KeepinCRM");
    return;
  }

  localStorage.setItem("crm_token", token);
  setError("");
  setStatus("Завантажую...");
  els.sync.disabled = true;

  try {
    const resp = await fetch(`${API_BASE}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        dateFrom: els.from.value,
        dateTo: els.to.value,
        managerIds: selectedManagerIds()
      })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Помилка завантаження");

    state.summary = data.summary;
    state.agreements = data.agreements;
    renderData();

    setStatus(`Оновлено: ${data.meta.loaded} угод`);
    notifyDone(`Обмін завершено: ${data.meta.loaded} угод`);
  } catch (e) {
    setError(e.message || "Помилка");
    setStatus("Оновлення з помилкою");
    notifyDone("Обмін завершено з помилкою");
  } finally {
    els.sync.disabled = false;
  }
}

function renderData() {
  const s = state.summary;
  if (!s) return;

  els.summary.innerHTML = [
    metric("Угод", s.agreementsCount),
    metric("Сума", `${s.totalRevenue.toFixed(2)} грн`),
    metric("Успішні", s.wonCount),
    metric("Неуспішні", s.failedCount)
  ].join("");

  els.managerRows.innerHTML = s.managerItems
    .map(
      (m) => `<tr><td>${escapeHtml(m.manager)}</td><td>${m.dealsCount}</td><td>${m.revenue.toFixed(2)} грн</td><td>${m.successfulCount}</td><td>${m.failedCount}</td></tr>`
    )
    .join("");

  const groups = groupBy(state.agreements, (a) => `${a.managerId}:${a.managerName}`);
  els.managerDeals.innerHTML = `<h3>Угоди по менеджерах</h3>` + Object.values(groups)
    .map((items) => {
      const manager = items[0]?.managerName || "Без менеджера";
      const deals = items
        .map(
          (a) => `<tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.stageName)}</td><td>${a.total.toFixed(2)} грн</td><td>${escapeHtml(a.clientName)}</td></tr>`
        )
        .join("");
      return `<details class="manager-block"><summary>${escapeHtml(manager)} (${items.length})</summary><table><thead><tr><th>Угода</th><th>Етап</th><th>Сума</th><th>Клієнт</th></tr></thead><tbody>${deals}</tbody></table></details>`;
    })
    .join("");
}

function metric(label, value) {
  return `<div><div class="muted">${label}</div><div><b>${value}</b></div></div>`;
}

function applyTheme() {
  const theme = els.theme.value;
  if (theme === "system") {
    document.body.removeAttribute("data-theme");
    return;
  }
  document.body.setAttribute("data-theme", theme);
}

function applyOpacity() {
  const percent = Number(els.opacity.value);
  const opacity = Math.max(0.15, Math.min(1, percent / 100));
  document.documentElement.style.setProperty("--card", `rgba(255,255,255,${opacity.toFixed(2)})`);
  if (document.body.getAttribute("data-theme") === "dark") {
    document.documentElement.style.setProperty("--card", `rgba(15,20,27,${opacity.toFixed(2)})`);
  }
  els.opacityValue.textContent = `${percent}%`;
}

function setupAutosync() {
  if (state.autoSyncTimer) clearInterval(state.autoSyncTimer);
  const minutes = Number(els.autosync.value);
  if (!minutes) return;

  state.autoSyncTimer = setInterval(() => {
    syncNow();
  }, minutes * 60 * 1000);
}

function notifyDone(message) {
  if (!els.notify.checked || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("CRMTeamLid", { body: message });
  }
}

function toDateInput(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setStatus(text) {
  els.status.textContent = text;
}

function setError(text) {
  els.error.textContent = text;
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
