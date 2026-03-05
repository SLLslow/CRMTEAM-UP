import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 8080;
const keepinBase = process.env.KEEPINCRM_BASE_URL || "https://api.keepincrm.com/v1";
const allowedOrigin = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crmteamlid-backend" });
});

app.post("/api/sync", async (req, res) => {
  try {
    const { token: incomingToken, dateFrom, dateTo, managerIds } = req.body ?? {};
    const token = incomingToken || process.env.KEEPINCRM_TOKEN || "";

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token is required (set KEEPINCRM_TOKEN on backend)." });
    }
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: "dateFrom and dateTo are required" });
    }

    const normalizedManagerIds = Array.isArray(managerIds)
      ? new Set(managerIds.map((v) => Number(v)).filter((v) => Number.isFinite(v)))
      : null;

    const agreements = await fetchAllAgreements({ token, dateFrom, dateTo });

    const filtered = agreements.filter((a) => {
      if (!normalizedManagerIds || normalizedManagerIds.size === 0) return true;
      return normalizedManagerIds.has(a.managerId);
    });

    const summary = buildSummary(filtered);
    const stages = [...new Set(filtered.map((a) => a.stageName || "-"))].sort();

    return res.json({
      summary,
      stages,
      agreements: filtered,
      meta: {
        loaded: filtered.length,
        sourceLoaded: agreements.length,
        range: { from: dateFrom, to: dateTo }
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message || "Internal server error"
    });
  }
});

async function fetchAllAgreements({ token, dateFrom, dateTo }) {
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = new URL(`${keepinBase}/agreements`);
    url.searchParams.set("q[ordered_at_gteq]", dateFrom);
    url.searchParams.set("q[ordered_at_lteq]", dateTo);
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        Accept: "application/json"
      }
    });

    if (response.status === 401) throw new Error("Невірний токен KeepinCRM");
    if (response.status === 429) throw new Error("Ліміт запитів KeepinCRM перевищено");
    if (!response.ok) throw new Error(`KeepinCRM error: ${response.status}`);

    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];

    all.push(...items.map(normalizeAgreement));

    totalPages = Number(payload?.pagination?.total_pages ?? payload?.pagination?.totalPages ?? page) || page;
    page += 1;
  }

  return all;
}

function normalizeAgreement(item) {
  const manager = item?.main_responsible ?? item?.mainResponsible ?? {};
  const stage = item?.stage ?? {};
  const source = item?.source ?? {};
  const client = item?.client ?? {};

  const clientName =
    client?.person || client?.company || [client?.last_name, client?.first_name].filter(Boolean).join(" ") || "-";

  const totalRaw = item?.total_amount ?? item?.total ?? 0;
  const total = Number(String(totalRaw).replace(/\s/g, "").replace(",", ".")) || 0;

  return {
    id: Number(item?.id ?? 0),
    title: item?.title || `Угода #${item?.id ?? "-"}`,
    orderedAt: item?.ordered_at ?? item?.orderedAt ?? null,
    createdAt: item?.created_at ?? item?.createdAt ?? null,
    updatedAt: item?.updated_at ?? item?.updatedAt ?? null,
    total,
    result: item?.result ?? null,
    managerId: Number(manager?.id ?? 0),
    managerName: manager?.name || "Без менеджера",
    stageName: stage?.name || "-",
    sourceName: source?.name || "-",
    clientName,
    clientId: Number(client?.id ?? 0)
  };
}

function buildSummary(agreements) {
  const totalRevenue = agreements.reduce((acc, a) => acc + a.total, 0);
  const agreementsCount = agreements.length;
  const wonCount = agreements.filter((a) => a.result === "successful").length;
  const failedCount = agreements.filter((a) => a.result === "failed").length;

  const managerMap = new Map();
  for (const a of agreements) {
    const key = `${a.managerId}:${a.managerName}`;
    if (!managerMap.has(key)) {
      managerMap.set(key, {
        managerId: a.managerId,
        manager: a.managerName,
        dealsCount: 0,
        revenue: 0,
        successfulCount: 0,
        failedCount: 0
      });
    }
    const m = managerMap.get(key);
    m.dealsCount += 1;
    m.revenue += a.total;
    if (a.result === "successful") m.successfulCount += 1;
    if (a.result === "failed") m.failedCount += 1;
  }

  const managerItems = [...managerMap.values()].sort((a, b) => b.revenue - a.revenue);

  return {
    totalRevenue,
    agreementsCount,
    wonCount,
    failedCount,
    managerItems
  };
}

app.listen(port, () => {
  console.log(`CRMTeamLid backend listening on :${port}`);
});
