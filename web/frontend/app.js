const API_BASE = window.location.hostname === "localhost" ? "http://localhost:8080" : "https://crmteam-up.onrender.com";

const state = {
  agreements: [],
  autoSyncTimer: null,
  selectedStages: new Set(),
  soundDataUrl: "",
  bgDataUrl: ""
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
  preset1: document.getElementById("preset1"),
  preset3: document.getElementById("preset3"),
  preset7: document.getElementById("preset7"),
  presetCustom: document.getElementById("presetCustom"),
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

async function init() {
  const now = new Date();
  const defaultFrom = toDateInput(addDays(now, -7));
  const defaultTo = toDateInput(now);

  els.from.value = localStorage.getItem("crm_from") || defaultFrom;
  els.to.value = localStorage.getItem("crm_to") || defaultTo;
  els.dataFrom.value = localStorage.getItem("crm_data_from") || els.from.value;
  els.dataTo.value = localStorage.getItem("crm_data_to") || els.to.value;
  els.token.value = "****************";

  els.theme.value = localStorage.getItem("crm_theme") || "system";
  els.opacity.value = localStorage.getItem("crm_panel_opacity") || "90";
  els.autosync.value = localStorage.getItem("crm_autosync") || "0";
  els.notify.checked = localStorage.getItem("crm_notify") === "1";

  state.soundDataUrl = localStorage.getItem("crm_sound_dataurl") || "";
  state.bgDataUrl = localStorage.getItem("crm_bg_dataurl") || "";

  applyTheme();
  applyOpacity();
  applyBackground();
  setupAutosync();

  bindEvents();

  await loadFromDb();
}

function bindEvents() {
  els.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  els.sync.addEventListener("click", syncNow);

  els.preset1.addEventListener("click", () => applyPresetDays(1));
  els.preset3.addEventListener("click", () => applyPresetDays(3));
  els.preset7.addEventListener("click", () => applyPresetDays(7));
  els.presetCustom.addEventListener("click", () => {
    localStorage.setItem("crm_last_preset", "custom");
  });

  els.from.addEventListener("change", () => {
    localStorage.setItem("crm_from", els.from.value);
    localStorage.setItem("crm_last_preset", "custom");
  });
  els.to.addEventListener("change", () => {
    localStorage.setItem("crm_to", els.to.value);
    localStorage.setItem("crm_last_preset", "custom");
  });

  els.dataFrom.addEventListener("change", () => {
    localStorage.setItem("crm_data_from", els.dataFrom.value);
    renderData();
  });
  els.dataTo.addEventListener("change", () => {
    localStorage.setItem("crm_data_to", els.dataTo.value);
    renderData();
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
    state.bgDataUrl = "";
    localStorage.removeItem("crm_bg_dataurl");
    applyBackground();
  });
  els.bgInput.addEventListener("change", async () => {
    const file = els.bgInput.files?.[0];
    if (!file) return;
    const dataUrl = await prepareBackgroundDataUrl(file);
    if (!dataUrl) {
      setError("Не вдалося обробити фото фону.");
      return;
    }

    state.bgDataUrl = dataUrl;
    applyBackground();
    setError("");

    try {
      localStorage.setItem("crm_bg_dataurl", dataUrl);
    } catch (_) {
      setError("Фото фону завелике для збереження. Фон працює лише до перезавантаження сторінки.");
    }
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

function applyPresetDays(days) {
  const to = new Date();
  const from = addDays(to, -days);
  els.from.value = toDateInput(from);
  els.to.value = toDateInput(to);
  localStorage.setItem("crm_from", els.from.value);
  localStorage.setItem("crm_to", els.to.value);
  localStorage.setItem("crm_last_preset", String(days));
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

async function loadFromDb() {
  try {
    const data = await fetchDataOnly();
    if (!data || !Array.isArray(data.agreements)) return;

    state.agreements = data.agreements;
    state.selectedStages = new Set(getAvailableStages(state.agreements));
    renderStageFilters();
    renderData();
    setStatus(`Завантажено з БД: ${state.agreements.length} угод`);
  } catch {
    // silent fallback
  }
}

async function fetchDataOnly() {
  const resp = await fetch(`${API_BASE}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dateFrom: els.from.value,
      dateTo: els.to.value,
      managerIds: selectedManagerIds()
    })
  });

  if (!resp.ok) return null;
  return resp.json();
}

async function syncNow() {
  setError("");
  setStatus("Завантажую...");
  els.sync.disabled = true;

  try {
    const resp = await fetch(`${API_BASE}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

    setStatus(`Оновлено: ${data.meta.loaded} угод (джерело CRM: ${data.meta.sourceLoaded})`);
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

  if (summary.agreementsCount === 0) {
    els.managerRows.innerHTML = `<tr><td colspan="5" class="muted">Немає угод за вибраними фільтрами.</td></tr>`;
    els.managerDeals.innerHTML = `<h3>Угоди по менеджерах</h3><div class="muted">Немає даних.</div>`;
    return;
  }

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
  const bg = state.bgDataUrl || localStorage.getItem("crm_bg_dataurl");
  if (bg) {
    document.body.style.backgroundImage = `url("${bg}")`;
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundAttachment = "fixed";
    return;
  }
  document.body.style.backgroundImage = "";
  document.body.style.background = "radial-gradient(circle at 15% 10%, var(--bg-2), var(--bg))";
}

async function prepareBackgroundDataUrl(file) {
  const original = await fileToDataUrl(file);
  if (!original || !original.startsWith("data:image/")) return null;

  try {
    return await resizeImageDataUrl(original, 1600, 0.82);
  } catch (_) {
    return original;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function resizeImageDataUrl(dataUrl, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return reject(new Error("Invalid image"));

      const scale = Math.min(1, maxSide / Math.max(w, h));
      const targetW = Math.max(1, Math.round(w * scale));
      const targetH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const output = canvas.toDataURL("image/jpeg", quality);
      resolve(output);
    };
    img.onerror = () => reject(new Error("Image load error"));
    img.src = dataUrl;
  });
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

function addDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
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
