const API_BASE = window.location.hostname === "localhost" ? "http://localhost:8080" : "https://crmteam-up.onrender.com";

const state = {
  agreements: [],
  autoSyncTimer: null,
  selectedStages: new Set(),
  soundDataUrl: "",
  bgDataUrl: "",
  authToken: "",
  authMode: "login",
  user: null,
  planPayload: null,
  planActiveManagerId: "13"
};

const els = {
  authGate: document.getElementById("authGate"),
  appRoot: document.getElementById("appRoot"),
  authModeLogin: document.getElementById("authModeLogin"),
  authModeRegister: document.getElementById("authModeRegister"),
  authNameWrap: document.getElementById("authNameWrap"),
  authName: document.getElementById("authName"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authSubmit: document.getElementById("authSubmit"),
  authError: document.getElementById("authError"),
  authUser: document.getElementById("authUser"),
  logoutBtn: document.getElementById("logoutBtn"),
  adminUsersCard: document.getElementById("adminUsersCard"),
  usersRefresh: document.getElementById("usersRefresh"),
  usersRows: document.getElementById("usersRows"),
  planPeriodType: document.getElementById("planPeriodType"),
  planWeekWrap: document.getElementById("planWeekWrap"),
  planMonthWrap: document.getElementById("planMonthWrap"),
  planWeekDate: document.getElementById("planWeekDate"),
  planMonthSelect: document.getElementById("planMonthSelect"),
  planMonthYear: document.getElementById("planMonthYear"),
  planLoad: document.getElementById("planLoad"),
  planSave: document.getElementById("planSave"),
  planTitle: document.getElementById("planTitle"),
  planStatusTop: document.getElementById("planStatusTop"),
  planStatus: document.getElementById("planStatus"),
  planGlobalWeek: document.getElementById("planGlobalWeek"),
  planGlobalMonth: document.getElementById("planGlobalMonth"),
  planGlobalWeekWrap: document.getElementById("planGlobalWeekWrap"),
  planGlobalMonthWrap: document.getElementById("planGlobalMonthWrap"),
  planManagerSelect: document.getElementById("planManagerSelect"),
  planManagerCompletion: document.getElementById("planManagerCompletion"),
  planMetricSumPlan: document.getElementById("planMetricSumPlan"),
  planMetricSumFact: document.getElementById("planMetricSumFact"),
  planMetricSuccessfulPlan: document.getElementById("planMetricSuccessfulPlan"),
  planMetricSuccessfulFact: document.getElementById("planMetricSuccessfulFact"),
  planMetricRefusalsPlan: document.getElementById("planMetricRefusalsPlan"),
  planMetricRefusalsFact: document.getElementById("planMetricRefusalsFact"),
  planMetricRequisitesPlan: document.getElementById("planMetricRequisitesPlan"),
  planMetricRequisitesFact: document.getElementById("planMetricRequisitesFact"),
  planMetricProposalsPlan: document.getElementById("planMetricProposalsPlan"),
  planMetricProposalsFact: document.getElementById("planMetricProposalsFact"),
  planMetricCallsPlan: document.getElementById("planMetricCallsPlan"),
  planMetricCallsFact: document.getElementById("planMetricCallsFact"),
  planMetricLeadsPlan: document.getElementById("planMetricLeadsPlan"),
  planMetricLeadsFact: document.getElementById("planMetricLeadsFact"),
  planMetricReactivationPlan: document.getElementById("planMetricReactivationPlan"),
  planMetricReactivationFact: document.getElementById("planMetricReactivationFact"),
  planMetricConversionPlan: document.getElementById("planMetricConversionPlan"),
  planMetricConversionFact: document.getElementById("planMetricConversionFact"),
  planManagerComment: document.getElementById("planManagerComment"),
  planHardSituation: document.getElementById("planHardSituation"),
  planSolvedHow: document.getElementById("planSolvedHow"),
  planHeroAction: document.getElementById("planHeroAction"),
  planConclusions: document.getElementById("planConclusions"),
  planNextTasks: document.getElementById("planNextTasks"),
  planNextPlan: document.getElementById("planNextPlan"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    exchange: document.getElementById("exchange"),
    data: document.getElementById("data"),
    plan: document.getElementById("plan"),
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
  state.authToken = localStorage.getItem("crm_auth_token") || "";
  const now = new Date();
  const defaultFrom = toDateInput(addDays(now, -7));
  const defaultTo = toDateInput(now);
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const savedMonth = localStorage.getItem("crm_plan_month_date") || defaultMonth;
  const [savedYear, savedMonthNum] = String(savedMonth).split("-");

  els.from.value = localStorage.getItem("crm_from") || defaultFrom;
  els.to.value = localStorage.getItem("crm_to") || defaultTo;
  els.dataFrom.value = localStorage.getItem("crm_data_from") || els.from.value;
  els.dataTo.value = localStorage.getItem("crm_data_to") || els.to.value;
  els.planWeekDate.value = localStorage.getItem("crm_plan_week_date") || defaultTo;
  els.planMonthYear.value = savedYear || String(now.getFullYear());
  els.planMonthSelect.value = savedMonthNum || String(now.getMonth() + 1).padStart(2, "0");
  els.planPeriodType.value = localStorage.getItem("crm_plan_period_type") || "week";
  els.token.value = "****************";
  state.planActiveManagerId = String(els.planManagerSelect.value || "13");

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
  togglePlanPeriodInputs();
  updatePlanTitle();
  updateAuthModeUI();
  const authOk = await ensureAuthSession();
  if (!authOk) {
    showAuthGate();
    return;
  }

  updatePresetButtons();
  setupThemeWatcher();

  await loadFromDb();
}

function bindEvents() {
  els.authModeLogin.addEventListener("click", () => setAuthMode("login"));
  els.authModeRegister.addEventListener("click", () => setAuthMode("register"));
  els.authSubmit.addEventListener("click", submitAuth);
  els.logoutBtn.addEventListener("click", logout);
  els.usersRefresh.addEventListener("click", loadUsersList);
  els.planPeriodType.addEventListener("change", () => {
    localStorage.setItem("crm_plan_period_type", els.planPeriodType.value);
    togglePlanPeriodInputs();
    updatePlanTitle();
    loadPlan();
  });
  els.planWeekDate.addEventListener("change", () => {
    localStorage.setItem("crm_plan_week_date", els.planWeekDate.value);
    if (els.planPeriodType.value === "week") {
      loadPlan();
    }
  });
  const savePlanMonthSelection = () => {
    localStorage.setItem("crm_plan_month_date", `${els.planMonthYear.value}-${els.planMonthSelect.value}`);
    if (els.planPeriodType.value === "month") {
      loadPlan();
    }
  };
  els.planMonthSelect.addEventListener("change", savePlanMonthSelection);
  els.planMonthYear.addEventListener("change", savePlanMonthSelection);
  els.planManagerSelect.addEventListener("change", () => {
    const previousManagerId = String(state.planActiveManagerId || "13");
    saveCurrentManagerPlanToState(previousManagerId);
    state.planActiveManagerId = getSelectedManagerId();
    fillManagerInputs(getCurrentManagerPlan());
  });
  els.planLoad.addEventListener("click", () => loadPlan());
  els.planSave.addEventListener("click", () => savePlan());
  [
    els.planMetricSumPlan,
    els.planMetricSuccessfulPlan,
    els.planMetricRefusalsPlan,
    els.planMetricRequisitesPlan,
    els.planMetricProposalsPlan,
    els.planMetricCallsPlan,
    els.planMetricLeadsPlan,
    els.planMetricReactivationPlan,
    els.planMetricConversionPlan,
    els.planMetricSumFact,
    els.planMetricSuccessfulFact,
    els.planMetricRefusalsFact,
    els.planMetricRequisitesFact,
    els.planMetricProposalsFact,
    els.planMetricCallsFact,
    els.planMetricLeadsFact,
    els.planMetricReactivationFact,
    els.planMetricConversionFact
  ].forEach((input) => {
    input.addEventListener("input", () => updateManagerCompletion());
  });

  els.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  els.sync.addEventListener("click", syncNow);

  els.preset1.addEventListener("click", () => applyPresetDays(1));
  els.preset3.addEventListener("click", () => applyPresetDays(3));
  els.preset7.addEventListener("click", () => applyPresetDays(7));
  els.presetCustom.addEventListener("click", () => {
    setPresetMode("custom");
  });

  els.from.addEventListener("change", () => {
    localStorage.setItem("crm_from", els.from.value);
    setPresetMode("custom");
  });
  els.to.addEventListener("change", () => {
    localStorage.setItem("crm_to", els.to.value);
    setPresetMode("custom");
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

function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  updateAuthModeUI();
}

function updateAuthModeUI() {
  const isRegister = state.authMode === "register";
  els.authModeLogin.classList.toggle("preset-active", !isRegister);
  els.authModeRegister.classList.toggle("preset-active", isRegister);
  els.authNameWrap.classList.toggle("hidden", !isRegister);
  els.authSubmit.textContent = isRegister ? "Створити акаунт" : "Увійти";
  els.authError.textContent = "";
}

async function submitAuth() {
  els.authError.textContent = "";
  const email = String(els.authEmail.value || "").trim();
  const password = String(els.authPassword.value || "");
  const fullName = String(els.authName.value || "").trim();

  if (!email || !password) {
    els.authError.textContent = "Вкажи email і пароль.";
    return;
  }

  const path = state.authMode === "register" ? "/auth/register" : "/auth/login";
  const body = state.authMode === "register" ? { email, password, fullName } : { email, password };

  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Помилка авторизації");
    if (!data.token) throw new Error("Сервер не повернув токен.");

    state.authToken = data.token;
    state.user = data.user || null;
    localStorage.setItem("crm_auth_token", state.authToken);
    showApp();
    await loadUsersList();
    await loadFromDb();
  } catch (error) {
    els.authError.textContent = error?.message || "Помилка авторизації";
  }
}

async function ensureAuthSession() {
  if (!state.authToken) return false;
  try {
    const resp = await apiFetch("/auth/me", { method: "GET" }, true);
    if (!resp.ok) return false;
    const data = await resp.json();
    state.user = data.user || null;
    showApp();
    await loadUsersList();
    return true;
  } catch {
    return false;
  }
}

function showAuthGate() {
  els.appRoot.classList.add("hidden");
  els.authGate.classList.remove("hidden");
  els.authUser.textContent = "";
  els.adminUsersCard.classList.add("hidden");
  els.usersRows.innerHTML = `<tr><td colspan="6" class="muted">Немає даних</td></tr>`;
  state.authToken = "";
  state.user = null;
  localStorage.removeItem("crm_auth_token");
}

function showApp() {
  els.authGate.classList.add("hidden");
  els.appRoot.classList.remove("hidden");
  const role = state.user?.isAdmin ? "admin" : "user";
  els.authUser.textContent = state.user?.email ? `Користувач: ${state.user.email} (${role})` : "";
  els.adminUsersCard.classList.toggle("hidden", !state.user?.isAdmin);
}

function logout() {
  showAuthGate();
  state.agreements = [];
  renderData();
  clearPlanForm();
}

function togglePlanPeriodInputs() {
  const isWeek = els.planPeriodType.value === "week";
  els.planWeekWrap.classList.toggle("hidden", !isWeek);
  els.planMonthWrap.classList.toggle("hidden", isWeek);
  els.planGlobalWeekWrap.classList.toggle("hidden", !isWeek);
  els.planGlobalMonthWrap.classList.toggle("hidden", isWeek);
}

function updatePlanTitle() {
  els.planTitle.textContent = els.planPeriodType.value === "week"
    ? "Щотижневий звіт Team Lead"
    : "Щомісячний звіт Team Lead";
}

function currentPlanPeriod() {
  const periodType = els.planPeriodType.value === "month" ? "month" : "week";
  let periodKey = "";
  if (periodType === "week") {
    periodKey = isoWeekKey(els.planWeekDate.value);
  } else {
    const year = String(els.planMonthYear.value || "").trim();
    const month = String(els.planMonthSelect.value || "").trim();
    periodKey = /^\d{4}$/.test(year) && /^\d{2}$/.test(month) ? `${year}-${month}` : "";
  }
  return { periodType, periodKey };
}

function setPlanStatus(message) {
  const text = String(message || "");
  els.planStatus.textContent = text;
  if (els.planStatusTop) {
    els.planStatusTop.textContent = text;
  }
}

async function loadPlan() {
  const { periodType, periodKey } = currentPlanPeriod();
  if (!periodKey) {
    setPlanStatus("Вкажи період плану.");
    return;
  }

  try {
    setPlanStatus("Завантаження...");
    const query = new URLSearchParams({ periodType, periodKey }).toString();
    const resp = await apiFetch(`/api/plans?${query}`, { method: "GET" });
    const data = await resp.json();
    const payload = data?.item?.payload || {};
    applyPlanPayload(payload);
    setPlanStatus(data?.item
      ? `План завантажено (${periodType}: ${periodKey})`
      : `План ще не створено (${periodType}: ${periodKey})`);
  } catch (error) {
    if (error?.message === "AUTH_REQUIRED") return;
    setPlanStatus("Не вдалося завантажити план.");
  }
}

async function savePlan() {
  const { periodType, periodKey } = currentPlanPeriod();
  if (!periodKey) {
    setPlanStatus("Вкажи період плану.");
    return;
  }

  const payload = readPlanPayload();
  try {
    setPlanStatus("Збереження...");
    const resp = await apiFetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodType, periodKey, payload })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Не вдалося зберегти план.");
    setPlanStatus(`План збережено (${periodType}: ${periodKey})`);
  } catch (error) {
    if (error?.message === "AUTH_REQUIRED") return;
    setPlanStatus(error?.message || "Не вдалося зберегти план.");
  }
}

function applyPlanPayload(payload) {
  state.planPayload = normalizePlanPayload(payload);
  state.planActiveManagerId = getSelectedManagerId();
  els.planGlobalWeek.value = state.planPayload.global.weekPlan || "";
  els.planGlobalMonth.value = state.planPayload.global.monthPlan || "";
  els.planMetricSumPlan.value = state.planPayload.global.sumPlan || "";
  els.planMetricSuccessfulPlan.value = state.planPayload.global.successfulPlan || "";
  els.planMetricRefusalsPlan.value = state.planPayload.global.refusalsPlan || "";
  els.planMetricRequisitesPlan.value = state.planPayload.global.requisitesPlan || "";
  els.planMetricProposalsPlan.value = state.planPayload.global.proposalsPlan || "";
  els.planMetricCallsPlan.value = state.planPayload.global.callsPlan || "";
  els.planMetricLeadsPlan.value = state.planPayload.global.leadsPlan || "";
  els.planMetricReactivationPlan.value = state.planPayload.global.reactivationPlan || "";
  els.planMetricConversionPlan.value = state.planPayload.global.conversionPlan || "";
  els.planHardSituation.value = state.planPayload.global.hardSituation || "";
  els.planSolvedHow.value = state.planPayload.global.solvedHow || "";
  els.planHeroAction.value = state.planPayload.global.heroAction || "";
  els.planConclusions.value = state.planPayload.global.conclusions || "";
  els.planNextTasks.value = state.planPayload.global.nextTasks || "";
  els.planNextPlan.value = state.planPayload.global.nextPlan || "";
  fillManagerInputs(getCurrentManagerPlan());
}

function readPlanPayload() {
  saveCurrentManagerPlanToState(state.planActiveManagerId);
  if (!state.planPayload) {
    state.planPayload = normalizePlanPayload({});
  }
  state.planPayload.global.weekPlan = String(els.planGlobalWeek.value || "").trim();
  state.planPayload.global.monthPlan = String(els.planGlobalMonth.value || "").trim();
  state.planPayload.global.sumPlan = String(els.planMetricSumPlan.value || "").trim();
  state.planPayload.global.successfulPlan = String(els.planMetricSuccessfulPlan.value || "").trim();
  state.planPayload.global.refusalsPlan = String(els.planMetricRefusalsPlan.value || "").trim();
  state.planPayload.global.requisitesPlan = String(els.planMetricRequisitesPlan.value || "").trim();
  state.planPayload.global.proposalsPlan = String(els.planMetricProposalsPlan.value || "").trim();
  state.planPayload.global.callsPlan = String(els.planMetricCallsPlan.value || "").trim();
  state.planPayload.global.leadsPlan = String(els.planMetricLeadsPlan.value || "").trim();
  state.planPayload.global.reactivationPlan = String(els.planMetricReactivationPlan.value || "").trim();
  state.planPayload.global.conversionPlan = String(els.planMetricConversionPlan.value || "").trim();
  state.planPayload.global.hardSituation = String(els.planHardSituation.value || "").trim();
  state.planPayload.global.solvedHow = String(els.planSolvedHow.value || "").trim();
  state.planPayload.global.heroAction = String(els.planHeroAction.value || "").trim();
  state.planPayload.global.conclusions = String(els.planConclusions.value || "").trim();
  state.planPayload.global.nextTasks = String(els.planNextTasks.value || "").trim();
  state.planPayload.global.nextPlan = String(els.planNextPlan.value || "").trim();
  return state.planPayload;
}

function clearPlanForm() {
  state.planPayload = normalizePlanPayload({});
  els.planGlobalWeek.value = "";
  els.planGlobalMonth.value = "";
  els.planMetricSumPlan.value = "";
  els.planMetricSuccessfulPlan.value = "";
  els.planMetricRefusalsPlan.value = "";
  els.planMetricRequisitesPlan.value = "";
  els.planMetricProposalsPlan.value = "";
  els.planMetricCallsPlan.value = "";
  els.planMetricLeadsPlan.value = "";
  els.planMetricReactivationPlan.value = "";
  els.planMetricConversionPlan.value = "";
  els.planHardSituation.value = "";
  els.planSolvedHow.value = "";
  els.planHeroAction.value = "";
  els.planConclusions.value = "";
  els.planNextTasks.value = "";
  els.planNextPlan.value = "";
  fillManagerInputs(getCurrentManagerPlan());
  setPlanStatus("План не завантажено");
}

function blankManagerPlan() {
  return {
    sumFact: "",
    successfulFact: "",
    refusalsFact: "",
    requisitesFact: "",
    proposalsFact: "",
    callsFact: "",
    leadsFact: "",
    reactivationFact: "",
    conversionFact: "",
    managerComment: ""
  };
}

function fillManagerInputs(values) {
  const v = { ...blankManagerPlan(), ...(values || {}) };
  els.planMetricSumFact.value = v.sumFact;
  els.planMetricSuccessfulFact.value = v.successfulFact;
  els.planMetricRefusalsFact.value = v.refusalsFact;
  els.planMetricRequisitesFact.value = v.requisitesFact;
  els.planMetricProposalsFact.value = v.proposalsFact;
  els.planMetricCallsFact.value = v.callsFact;
  els.planMetricLeadsFact.value = v.leadsFact;
  els.planMetricReactivationFact.value = v.reactivationFact;
  els.planMetricConversionFact.value = v.conversionFact;
  els.planManagerComment.value = v.managerComment;
  updateManagerCompletion();
}

function readCurrentManagerInputs() {
  return {
    sumFact: String(els.planMetricSumFact.value || "").trim(),
    successfulFact: String(els.planMetricSuccessfulFact.value || "").trim(),
    refusalsFact: String(els.planMetricRefusalsFact.value || "").trim(),
    requisitesFact: String(els.planMetricRequisitesFact.value || "").trim(),
    proposalsFact: String(els.planMetricProposalsFact.value || "").trim(),
    callsFact: String(els.planMetricCallsFact.value || "").trim(),
    leadsFact: String(els.planMetricLeadsFact.value || "").trim(),
    reactivationFact: String(els.planMetricReactivationFact.value || "").trim(),
    conversionFact: String(els.planMetricConversionFact.value || "").trim(),
    managerComment: String(els.planManagerComment.value || "").trim()
  };
}

function getSelectedManagerId() {
  return String(els.planManagerSelect.value || "13");
}

function getCurrentManagerPlan() {
  const payload = normalizePlanPayload(state.planPayload || {});
  const managerId = getSelectedManagerId();
  return payload.managers[managerId] || blankManagerPlan();
}

function saveCurrentManagerPlanToState(managerIdOverride) {
  if (!state.planPayload) {
    state.planPayload = normalizePlanPayload({});
  }
  const managerId = String(managerIdOverride || getSelectedManagerId());
  state.planPayload.managers[managerId] = readCurrentManagerInputs();
}

function normalizePlanPayload(payload) {
  const out = payload && typeof payload === "object" ? { ...payload } : {};
  if (!out.global || typeof out.global !== "object") {
    out.global = {};
  }
  const managerSeed = (out.managers && (out.managers["13"] || out.managers["9"] || out.managers["37"] || out.managers["12"])) || {};
  out.global.weekPlan = String(out.global.weekPlan || "");
  out.global.monthPlan = String(out.global.monthPlan || "");
  out.global.sumPlan = String(out.global.sumPlan || managerSeed.sumPlan || "");
  out.global.successfulPlan = String(out.global.successfulPlan || managerSeed.successfulPlan || "");
  out.global.refusalsPlan = String(out.global.refusalsPlan || managerSeed.refusalsPlan || "");
  out.global.requisitesPlan = String(out.global.requisitesPlan || managerSeed.requisitesPlan || "");
  out.global.proposalsPlan = String(out.global.proposalsPlan || managerSeed.proposalsPlan || "");
  out.global.callsPlan = String(out.global.callsPlan || managerSeed.callsPlan || "");
  out.global.leadsPlan = String(out.global.leadsPlan || managerSeed.leadsPlan || "");
  out.global.reactivationPlan = String(out.global.reactivationPlan || managerSeed.reactivationPlan || "");
  out.global.conversionPlan = String(out.global.conversionPlan || managerSeed.conversionPlan || "");
  out.global.hardSituation = String(out.global.hardSituation || managerSeed.hardSituation || "");
  out.global.solvedHow = String(out.global.solvedHow || managerSeed.solvedHow || "");
  out.global.heroAction = String(out.global.heroAction || managerSeed.heroAction || "");
  out.global.conclusions = String(out.global.conclusions || managerSeed.conclusions || "");
  out.global.nextTasks = String(out.global.nextTasks || managerSeed.nextTasks || "");
  out.global.nextPlan = String(out.global.nextPlan || managerSeed.nextPlan || "");
  if (!out.managers || typeof out.managers !== "object") {
    out.managers = {};
  }

  const managerIds = ["13", "9", "37", "12"];
  managerIds.forEach((id) => {
    out.managers[id] = { ...blankManagerPlan(), ...(out.managers[id] || {}) };
  });
  return out;
}

function updateManagerCompletion() {
  const metricPairs = [
    [els.planMetricSumPlan, els.planMetricSumFact],
    [els.planMetricSuccessfulPlan, els.planMetricSuccessfulFact],
    [els.planMetricRefusalsPlan, els.planMetricRefusalsFact],
    [els.planMetricRequisitesPlan, els.planMetricRequisitesFact],
    [els.planMetricProposalsPlan, els.planMetricProposalsFact],
    [els.planMetricCallsPlan, els.planMetricCallsFact],
    [els.planMetricLeadsPlan, els.planMetricLeadsFact],
    [els.planMetricReactivationPlan, els.planMetricReactivationFact],
    [els.planMetricConversionPlan, els.planMetricConversionFact]
  ];

  let ratioSum = 0;
  let ratioCount = 0;

  metricPairs.forEach(([planInput, factInput]) => {
    const plan = parseNumber(planInput.value);
    if (plan <= 0) return;
    const fact = parseNumber(factInput.value);
    ratioSum += fact / plan;
    ratioCount += 1;
  });

  els.planManagerCompletion.value = ratioCount > 0 ? ((ratioSum / ratioCount) * 100).toFixed(2) : "0";
}

function parseNumber(value) {
  const normalized = String(value || "").replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

async function loadUsersList() {
  if (!state.user?.isAdmin) return;
  try {
    const resp = await apiFetch("/auth/users", { method: "GET" });
    const data = await resp.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      els.usersRows.innerHTML = `<tr><td colspan="6" class="muted">Користувачів ще немає.</td></tr>`;
      return;
    }
    els.usersRows.innerHTML = items
      .map((user) => {
        const role = user.isAdmin ? "admin" : "user";
        const status = user.isActive ? "active" : "disabled";
        const created = formatDateTime(user.createdAt);
        return `<tr>
          <td>${Number(user.id) || "-"}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(user.fullName || "-")}</td>
          <td>${role}</td>
          <td>${status}</td>
          <td>${escapeHtml(created)}</td>
        </tr>`;
      })
      .join("");
  } catch (error) {
    if (error?.message === "AUTH_REQUIRED") {
      return;
    }
    els.usersRows.innerHTML = `<tr><td colspan="6" class="err">Не вдалося завантажити список користувачів.</td></tr>`;
  }
}

function applyPresetDays(days) {
  const to = new Date();
  const from = addDays(to, -days);
  els.from.value = toDateInput(from);
  els.to.value = toDateInput(to);
  localStorage.setItem("crm_from", els.from.value);
  localStorage.setItem("crm_to", els.to.value);
  setPresetMode(String(days));
}

function setPresetMode(mode) {
  localStorage.setItem("crm_last_preset", mode);
  updatePresetButtons();
}

function updatePresetButtons() {
  const mode = localStorage.getItem("crm_last_preset") || "7";
  if (!localStorage.getItem("crm_last_preset")) {
    localStorage.setItem("crm_last_preset", mode);
  }
  els.preset1.classList.toggle("preset-active", mode === "1");
  els.preset3.classList.toggle("preset-active", mode === "3");
  els.preset7.classList.toggle("preset-active", mode === "7");
  els.presetCustom.classList.toggle("preset-active", mode === "custom");
}

function switchTab(tab) {
  els.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  Object.entries(els.panels).forEach(([key, node]) => {
    node.classList.toggle("hidden", key !== tab);
  });
  if (tab === "plan") {
    loadPlan();
  }
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
  const resp = await apiFetch("/api/data", {
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
    const resp = await apiFetch("/api/sync", {
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
    if (message === "AUTH_REQUIRED") {
      setError("Сесію завершено. Увійди повторно.");
      showAuthGate();
      return;
    }
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
    metric("Неуспішні", summary.failedCount),
    metric("Сума успішних", `${summary.successfulRevenue.toFixed(2)} грн`),
    metric("Сума неуспішних", `${summary.failedRevenue.toFixed(2)} грн`)
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
      return `<details class="manager-block"><summary>${escapeHtml(manager)} (${items.length})</summary><div class="table-wrap"><table><thead><tr><th>Угода</th><th>Етап</th><th>Сума</th><th>Клієнт</th></tr></thead><tbody>${deals}</tbody></table></div></details>`;
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
  const successfulRevenue = agreements
    .filter((a) => a.result === "successful")
    .reduce((acc, a) => acc + (Number(a.total) || 0), 0);
  const failedRevenue = agreements
    .filter((a) => a.result === "failed")
    .reduce((acc, a) => acc + (Number(a.total) || 0), 0);
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
  return {
    totalRevenue,
    successfulRevenue,
    failedRevenue,
    agreementsCount,
    wonCount,
    failedCount,
    managerItems
  };
}

function metric(label, value) {
  return `<div><div class="muted">${label}</div><div><b>${value}</b></div></div>`;
}

function applyTheme() {
  const theme = els.theme.value;
  if (theme === "system") {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.setAttribute("data-theme", prefersDark ? "dark" : "light");
    return;
  }
  document.body.setAttribute("data-theme", theme);
}

function applyOpacity() {
  const percent = Number(els.opacity.value);
  const opacity = Math.max(0.15, Math.min(1, percent / 100));
  if (isDarkThemeActive()) {
    document.body.style.setProperty("--card", `rgba(15,20,27,${opacity.toFixed(2)})`);
  } else {
    document.body.style.setProperty("--card", `rgba(255,255,255,${opacity.toFixed(2)})`);
  }
  els.opacityValue.textContent = `${percent}%`;
}

function isDarkThemeActive() {
  const explicitTheme = document.body.getAttribute("data-theme");
  if (explicitTheme === "dark") return true;
  if (explicitTheme === "light") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function setupThemeWatcher() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener?.("change", () => {
    if (els.theme.value === "system") {
      applyTheme();
      applyOpacity();
    }
  });
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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("uk-UA");
}

function isoWeekKey(dateInputValue) {
  if (!dateInputValue) return "";
  const date = new Date(`${dateInputValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  const dayNum = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayNum + 3);
  const isoYear = date.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}

async function apiFetch(path, options = {}, raw = false) {
  const headers = new Headers(options.headers || {});
  if (state.authToken) {
    headers.set("Authorization", `Bearer ${state.authToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    if (!raw) showAuthGate();
    throw new Error("AUTH_REQUIRED");
  }

  return response;
}
