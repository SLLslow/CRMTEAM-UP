const API_BASE = window.location.hostname === "localhost" ? "http://localhost:8080" : "https://crmteam-up.onrender.com";

const state = {
  agreements: [],
  autoSyncTimer: null,
  selectedStages: new Set(),
  soundDataUrl: ""
};

const els = {
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    exchange: document.getElementById("exchange"),
    data: document.getElementById("data"),
    settings: document.getElementById("settings")
  },
  token: document.getElementById("token"),
  rememberToken: document.getElementById("rememberToken"),
  from: document.getElementById("from"),
  to: document.getElementById("to"),
  sync: document.getElementById("sync"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  dataFrom: document.getElementById("dataFrom"),
  dataTo: document.getElementById("dataTo"),
  stages: document.getElementById("stages"),
  stagesAll: document.getElementById("stagesAll"),
  stagesClear: document.getElementById("stagesClear"),
  summary: document.getElementById("summary"),
  managerRows: document.getElementById("managerRows"),
  managerDeals: document.getElementById("managerDeals"),
  theme: document.getElementById("theme"),
  opacity: document.getElementById("opacity"),
  opacityValue: document.getElementById("opacityValue"),
  autosync: document.getElementById("autosync"),
  notify: document.getElementById("notify"),
  bgPick: document.getElementById("bgPick"),
  bgClear: document.getElementById("bgClear"),
  bgInput: document.getElementById("bgInput"),
  soundPick: document.getElementById("soundPick"),
  soundClear: document.getElementById("soundClear"),
  soundTest: document.getElementById("soundTest"),
  soundInput: document.getElementById("soundInput")
};

init();

function init() {
  const now = new Date();
  const before = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const fromDefault = toDateInput(before);
  const toDefault = toDateInput(now);

  els.from.value = localStorage.getItem("crm_from") || fromDefault;
  els.to.value = localStorage.getItem("crm_to") || toDefault;
  els.dataFrom.value = localStorage.getItem("crm_data_from") || els.from.value;
  els.dataTo.value = localStorage.getItem("crm_data_to") || els.to.value;

  const remember = localStorage.getItem("crm_remember_token") === "1";
  els.rememberToken.checked = remember;
  els.token.value = remember ? localStorage.getItem("crm_token") || "" : "";

  els.theme.value = localStorage.getItem("crm_theme") || "system";
  els.opacity.value = localStorage.getItem("crm_panel_opacity") || "90";
  els.autosync.value = localStorage.getItem("crm_autosync") || "0";
  els.notify.checked = localStorage.getItem("crm_notify") === "1";

  state.soundDataUrl = localStorage.getItem("crm_sound_dataurl") || "";

  applyTheme();
  applyOpacity();
  applyBackground();
  setupAutosync();

  els.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  els.sync.addEventListener("click", syncNow);

  els.from.addEventListener("change", () => localStorage.setItem("crm_from", els.from.value));
  els.to.addEventListener("change", () => localStorage.setItem("crm_to", els.to.value));
  els.dataFrom.addEventListener("change", () => {
    localStorage.setItem("crm_data_from", els.dataFrom.value);
    renderData();
  });
  els.dataTo.addEventListener("change", () => {
    localStorage.setItem("crm_data_to", els.dataTo.value);
    renderData();
  });

  els.rememberToken.addEventListener("change", () => {
    localStorage.setItem("crm_remember_token", els.rememberToken.checked ? "1" : "0");
    if (!els.rememberToken.checked) {
      localStorage.removeItem("crm_token");
      els.token.value = "";
    }
  });

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

  els.bgPick.addEventListener("click", () => els.bgInput.click());
  els.bgClear.addEventListener("click", () => {
    localStorage.removeItem("crm_bg_dataurl");
    applyBackground();
  });
  els.bgInput.addEventListener("change", () => {
    const file = els.bgInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl.startsWith("data:image/")) {
        localStorage.setItem("crm_bg_dataurl", dataUrl);
        applyBackground();
      }
    };
    reader.readAsDataURL(file);
  });

  els.soundPick.addEventListener("click", () => els.soundInput.click());
  els.soundClear.addEventListener("click", () => {
    state.soundDataUrl = "";
    localStorage.removeItem("crm_sound_dataurl");
  });
  els.soundTest.addEventListener("click", () => playNotificationSound());
  els.soundInput.addEventListener("change", () => {
    const file = els.soundInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl.startsWith("data:audio/")) {
        state.soundDataUrl = dataUrl;
        localStorage.setItem("crm_sound_dataurl", dataUrl);
      }
    };
    reader.readAsDataURL(file);
  });

  els.stagesAll.addEventListener("click", () => {
    state.selectedStages = new Set(getAvailableStages(state.agreements));
    renderStageFilters();
    renderData();
  });

  els.stagesClear.addEventListener("click", () => {
    state.selectedStages.clear();
    renderStageFilters();
    renderData();
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

  if (els.rememberToken.checked) {
    localStorage.setItem("crm_token", token);
  }

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

    state.agreements = Array.isArray(data.agreements) ? data.agreements : [];
    state.selectedStages = new Set(getAvailableStages(state.agreements));

    if (!localStorage.getItem("crm_data_from")) els.dataFrom.value = els.from.value;
    if (!localStorage.getItem("crm_data_to")) els.dataTo.value = els.to.value;

    renderStageFilters();
    renderData();

    setStatus(`Оновлено: ${data.meta.loaded} угод`);
    notifyDone(`Обмін завершено: ${data.meta.loaded} угод`);
  } catch (e) {
    const message = e?.message || "";
    if (message === "Load failed" || message === "Failed to fetch") {
      setError("Немає відповіді від backend. Перевір Render URL/CORS і /health.");
    } else {
      setError(message || "Помилка");
    }
    setStatus("Оновлення з помилкою");
    notifyDone("Обмін завершено з помилкою");
  } finally {
    els.sync.disabled = false;
  }
}

function renderStageFilters() {
  const stages = getAvailableStages(state.agreements);
  if (!stages.length) {
    els.stages.innerHTML = `<span class="muted">Етапи з'являться після першого обміну.</span>`;
    return;
  }

  els.stages.innerHTML = stages
    .map((stage) => {
      const checked = state.selectedStages.has(stage) ? "checked" : "";
      return `<label><input type="checkbox" class="stage" value="${escapeHtml(stage)}" ${checked} /> ${escapeHtml(stage)}</label>`;
    })
    .join("");

  [...els.stages.querySelectorAll(".stage")].forEach((node) => {
    node.addEventListener("change", () => {
      const stage = node.value;
      if (node.checked) state.selectedStages.add(stage);
      else state.selectedStages.delete(stage);
      renderData();
    });
  });
}

function renderData() {
  const filtered = getFilteredAgreements();
  const summary = buildSummary(filtered);

  els.summary.innerHTML = [
    metric("Угод", summary.agreementsCount),
    metric("Сума", `${summary.totalRevenue.toFixed(2)} грн`),
    metric("Успішні", summary.wonCount),
    metric("Неуспішні", summary.failedCount)
  ].join("");

  els.managerRows.innerHTML = summary.managerItems
    .map(
      (m) => `<tr><td>${escapeHtml(m.manager)}</td><td>${m.dealsCount}</td><td>${m.revenue.toFixed(2)} грн</td><td>${m.successfulCount}</td><td>${m.failedCount}</td></tr>`
    )
    .join("");

  const groups = groupBy(filtered, (a) => `${a.managerId}:${a.managerName}`);
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

function getFilteredAgreements() {
  const from = new Date(`${els.dataFrom.value}T00:00:00`);
  const to = new Date(`${els.dataTo.value}T23:59:59`);

  return state.agreements.filter((a) => {
    const stage = a.stageName || "-";
    const stageAllowed = state.selectedStages.size === 0 || state.selectedStages.has(stage);
    if (!stageAllowed) return false;

    const dateStr = a.orderedAt || a.createdAt;
    if (!dateStr) return true;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return true;
    return date >= from && date <= to;
  });
}

function getAvailableStages(agreements) {
  return [...new Set((agreements || []).map((a) => a.stageName || "-"))].sort();
}

function buildSummary(agreements) {
  const totalRevenue = agreements.reduce((acc, a) => acc + (Number(a.total) || 0), 0);
  const agreementsCount = agreements.length;
  const wonCount = agreements.filter((a) => a.result === "successful").length;
  const failedCount = agreements.filter((a) => a.result === "failed").length;

  const managerMap = new Map();
  for (const a of agreements) {
    const key = `${a.managerId}:${a.managerName}`;
    if (!managerMap.has(key)) {
      managerMap.set(key, {
        manager: a.managerName || "Без менеджера",
        dealsCount: 0,
        revenue: 0,
        successfulCount: 0,
        failedCount: 0
      });
    }
    const m = managerMap.get(key);
    m.dealsCount += 1;
    m.revenue += Number(a.total) || 0;
    if (a.result === "successful") m.successfulCount += 1;
    if (a.result === "failed") m.failedCount += 1;
  }

  const managerItems = [...managerMap.values()].sort((a, b) => b.revenue - a.revenue);
  return { totalRevenue, agreementsCount, wonCount, failedCount, managerItems };
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
  if (document.body.getAttribute("data-theme") === "dark") {
    document.documentElement.style.setProperty("--card", `rgba(15,20,27,${opacity.toFixed(2)})`);
  } else {
    document.documentElement.style.setProperty("--card", `rgba(255,255,255,${opacity.toFixed(2)})`);
  }
  els.opacityValue.textContent = `${percent}%`;
}

function applyBackground() {
  const bg = localStorage.getItem("crm_bg_dataurl");
  if (bg) {
    document.body.style.background = `center/cover fixed no-repeat url('${bg}')`;
    return;
  }
  document.body.style.background = "radial-gradient(circle at 15% 10%, var(--bg-2), var(--bg))";
}

function setupAutosync() {
  if (state.autoSyncTimer) clearInterval(state.autoSyncTimer);
  const minutes = Number(els.autosync.value);
  if (!minutes) return;

  state.autoSyncTimer = setInterval(() => {
    syncNow();
  }, minutes * 60 * 1000);
}

function playNotificationSound() {
  if (!state.soundDataUrl) return;
  try {
    const audio = new Audio(state.soundDataUrl);
    audio.play().catch(() => {});
  } catch (_) {}
}

function notifyDone(message) {
  if (els.notify.checked) {
    playNotificationSound();
  }

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
