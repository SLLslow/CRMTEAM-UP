import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { Pool } = pg;

const app = express();
const port = process.env.PORT || 8080;
const keepinBase = process.env.KEEPINCRM_BASE_URL || "https://api.keepincrm.com/v1";
const allowedOrigin = process.env.CORS_ORIGIN || "*";
const dbUrl = process.env.DATABASE_URL || "";
const backendVersion =
  process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
  process.env.GITHUB_SHA?.slice(0, 7) ||
  "dev";
const authJwtSecret = process.env.AUTH_JWT_SECRET || "crmteamlid-dev-secret-change-me";
const authJwtExpiresIn = process.env.AUTH_JWT_EXPIRES_IN || "7d";
const authAdminEmail = String(process.env.AUTH_ADMIN_EMAIL || "").trim().toLowerCase();

const pool = dbUrl
  ? new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    })
  : null;

app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin, allowedOrigin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  const db = await isDbReady();
  res.json({ ok: true, service: "crmteamlid-backend", db, version: backendVersion });
});

app.post("/auth/register", async (req, res) => {
  try {
    if (!pool) {
      return res.status(400).json({ error: "DATABASE_URL is not configured." });
    }

    const { email, password, fullName } = req.body ?? {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const safeFullName = String(fullName || "").trim().slice(0, 120);

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({ error: "Вкажіть коректний email." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "Пароль має містити мінімум 6 символів." });
    }

    const existing = await pool.query(`select id from app_users where email = $1 limit 1`, [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Користувач з таким email вже існує." });
    }

    const usersCountResult = await pool.query(`select count(*)::int as "count" from app_users`);
    const usersCount = Number(usersCountResult.rows[0]?.count || 0);
    const shouldBeAdmin = usersCount === 0 || (!!authAdminEmail && normalizedEmail === authAdminEmail);

    const passwordHash = await bcrypt.hash(String(password), 12);
    const inserted = await pool.query(
      `
        insert into app_users (email, password_hash, full_name, is_admin, is_active, created_at, updated_at)
        values ($1, $2, $3, $4, true, now(), now())
        returning id, email, full_name as "fullName", is_admin as "isAdmin", is_active as "isActive"
      `,
      [normalizedEmail, passwordHash, safeFullName || null, shouldBeAdmin]
    );
    const user = inserted.rows[0];
    const token = signAuthToken(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    if (!pool) {
      return res.status(400).json({ error: "DATABASE_URL is not configured." });
    }

    const { email, password } = req.body ?? {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email і пароль обов'язкові." });
    }

    const found = await pool.query(
      `
        select id, email, password_hash as "passwordHash", full_name as "fullName", is_admin as "isAdmin", is_active as "isActive"
        from app_users
        where email = $1
        limit 1
      `,
      [normalizedEmail]
    );
    const user = found.rows[0];
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Невірний email або пароль." });
    }

    const isValid = await bcrypt.compare(String(password), user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Невірний email або пароль." });
    }

    const token = signAuthToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isAdmin: Boolean(user.isAdmin),
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

app.get("/auth/me", async (req, res) => {
  try {
    const auth = requireAuth(req);
    return res.json({
      user: {
        id: auth.userId,
        email: auth.email,
        fullName: auth.fullName,
        isAdmin: Boolean(auth.isAdmin)
      }
    });
  } catch (error) {
    return res.status(401).json({ error: error?.message || "Unauthorized" });
  }
});

app.get("/auth/users", async (req, res) => {
  try {
    const auth = requireAuth(req);
    if (!auth.isAdmin) {
      return res.status(403).json({ error: "Недостатньо прав доступу." });
    }

    if (!pool) {
      return res.status(400).json({ error: "DATABASE_URL is not configured." });
    }

    const { rows } = await pool.query(
      `
        select
          id,
          email,
          full_name as "fullName",
          is_admin as "isAdmin",
          is_active as "isActive",
          created_at as "createdAt"
        from app_users
        order by created_at asc
      `
    );
    return res.json({ items: rows });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: error?.message || "Unauthorized" });
    }
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

app.get("/api/plans", async (req, res) => {
  try {
    const auth = requireAuth(req);
    if (!pool) {
      return res.status(400).json({ error: "DATABASE_URL is not configured." });
    }

    const periodType = normalizePeriodType(req.query.periodType);
    const periodKey = String(req.query.periodKey || "").trim();
    if (!periodType || !periodKey) {
      return res.status(400).json({ error: "periodType and periodKey are required." });
    }

    const { rows } = await pool.query(
      `
        select
          id,
          period_type as "periodType",
          period_key as "periodKey",
          payload,
          updated_at as "updatedAt"
        from team_plans
        where user_id = $1 and period_type = $2 and period_key = $3
        limit 1
      `,
      [auth.userId, periodType, periodKey]
    );

    return res.json({ item: rows[0] || null });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: error?.message || "Unauthorized" });
    }
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

app.post("/api/plans", async (req, res) => {
  try {
    const auth = requireAuth(req);
    if (!pool) {
      return res.status(400).json({ error: "DATABASE_URL is not configured." });
    }

    const periodType = normalizePeriodType(req.body?.periodType);
    const periodKey = String(req.body?.periodKey || "").trim();
    const payload = req.body?.payload;

    if (!periodType || !periodKey) {
      return res.status(400).json({ error: "periodType and periodKey are required." });
    }
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "payload is required." });
    }

    const { rows } = await pool.query(
      `
        insert into team_plans (user_id, period_type, period_key, payload, updated_at)
        values ($1, $2, $3, $4::jsonb, now())
        on conflict (user_id, period_type, period_key)
        do update set
          payload = excluded.payload,
          updated_at = now()
        returning
          id,
          period_type as "periodType",
          period_key as "periodKey",
          payload,
          updated_at as "updatedAt"
      `,
      [auth.userId, periodType, periodKey, JSON.stringify(payload)]
    );

    return res.json({ item: rows[0] });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: error?.message || "Unauthorized" });
    }
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

app.post("/api/data", async (req, res) => {
  try {
    requireAuth(req);

    if (!pool) {
      return res.status(400).json({ error: "DATABASE_URL is not configured." });
    }

    const { dateFrom, dateTo, managerIds } = req.body ?? {};
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: "dateFrom and dateTo are required" });
    }

    const normalizedManagerIds = normalizeManagerIds(managerIds);
    const agreements = await queryAgreements({ dateFrom, dateTo, managerIds: normalizedManagerIds });
    const summary = buildSummary(agreements);
    const stages = [...new Set(agreements.map((a) => a.stageName || "-"))].sort();

    return res.json({
      summary,
      stages,
      agreements,
      meta: {
        loaded: agreements.length,
        sourceLoaded: agreements.length,
        range: { from: dateFrom, to: dateTo },
        fromDb: true
      }
    });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: error?.message || "Unauthorized" });
    }
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

app.get("/api/sync/logs", async (req, res) => {
  try {
    requireAuth(req);

    if (!pool) {
      return res.status(400).json({ error: "DATABASE_URL is not configured." });
    }

    const limitRaw = Number(req.query.limit ?? 5);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 5;
    const logs = await getSyncLogs(limit);
    return res.json({ items: logs });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: error?.message || "Unauthorized" });
    }
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

app.post("/api/sync", async (req, res) => {
  const startedAt = new Date();
  let loadedCount = 0;
  let sourceLoadedCount = 0;

  try {
    requireAuth(req);

    const { token: incomingToken, dateFrom, dateTo, managerIds } = req.body ?? {};
    const token = incomingToken || process.env.KEEPINCRM_TOKEN || "";

    if (!token || typeof token !== "string") {
      await insertSyncLog({
        startedAt,
        finishedAt: new Date(),
        status: "error",
        dateFrom,
        dateTo,
        managerIds,
        loadedCount: 0,
        sourceLoadedCount: 0,
        errorMessage: "Token is required"
      });
      return res.status(400).json({ error: "Token is required (set KEEPINCRM_TOKEN on backend)." });
    }
    if (!dateFrom || !dateTo) {
      await insertSyncLog({
        startedAt,
        finishedAt: new Date(),
        status: "error",
        dateFrom,
        dateTo,
        managerIds,
        loadedCount: 0,
        sourceLoadedCount: 0,
        errorMessage: "dateFrom and dateTo are required"
      });
      return res.status(400).json({ error: "dateFrom and dateTo are required" });
    }

    const normalizedManagerIds = normalizeManagerIds(managerIds);

    // Always load the full requested date range from CRM for correctness.
    // Incremental mode may skip records when CRM updated_at checkpoints drift.
    const fetchedRaw = await fetchAllAgreements({
      token,
      dateFrom,
      dateTo,
      updatedFrom: null
    });

    const fetched = deduplicateAgreements(fetchedRaw);

    if (pool && fetched.length > 0) {
      await upsertAgreements(fetched);
    }
    const nextCheckpoint = nextSyncCheckpoint(null, fetched);
    if (nextCheckpoint) {
      await setLastSyncAt(nextCheckpoint);
    }

    const agreements = pool
      ? await queryAgreements({ dateFrom, dateTo, managerIds: normalizedManagerIds })
      : fetched.filter((a) => normalizedManagerIds.size === 0 || normalizedManagerIds.has(a.managerId));
    loadedCount = agreements.length;
    sourceLoadedCount = fetched.length;

    await insertSyncLog({
      startedAt,
      finishedAt: new Date(),
      status: "ok",
      dateFrom,
      dateTo,
      managerIds: [...normalizedManagerIds],
      loadedCount,
      sourceLoadedCount,
      errorMessage: null
    });

    const summary = buildSummary(agreements);
    const stages = [...new Set(agreements.map((a) => a.stageName || "-"))].sort();

    return res.json({
      summary,
      stages,
      agreements,
      meta: {
        loaded: agreements.length,
        sourceLoaded: fetched.length,
        range: { from: dateFrom, to: dateTo },
        incrementalFrom: null,
        fromDb: !!pool
      }
    });
  } catch (error) {
    if (isAuthError(error)) {
      return res.status(401).json({ error: error?.message || "Unauthorized" });
    }
    const { dateFrom, dateTo, managerIds } = req.body ?? {};
    await insertSyncLog({
      startedAt,
      finishedAt: new Date(),
      status: "error",
      dateFrom,
      dateTo,
      managerIds,
      loadedCount,
      sourceLoadedCount,
      errorMessage: error?.message || "Internal server error"
    });
    console.error(error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

async function fetchAllAgreements({ token, dateFrom, dateTo, updatedFrom }) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  const createdFrom = keepinStartOfDay(dateFrom);
  const createdTo = keepinEndOfDay(dateTo);

  while (page <= totalPages) {
    const url = new URL(`${keepinBase}/agreements`);
    url.searchParams.set("q[created_at_gteq]", createdFrom);
    url.searchParams.set("q[created_at_lteq]", createdTo);
    if (updatedFrom) {
      url.searchParams.set("q[updated_at_gteq]", updatedFrom);
    }
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

function keepinStartOfDay(value) {
  const raw = String(value || "").trim();
  if (!raw) return value;
  if (raw.includes("T")) return raw;
  return `${raw}T00:00:00`;
}

function keepinEndOfDay(value) {
  const raw = String(value || "").trim();
  if (!raw) return value;
  if (raw.includes("T")) return raw;
  return `${raw}T23:59:59`;
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
    clientId: Number(client?.id ?? 0),
    raw: item
  };
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

function deduplicateAgreements(agreements) {
  const map = new Map();
  for (const agreement of agreements) {
    if (!agreement?.id) continue;
    map.set(agreement.id, agreement);
  }
  return [...map.values()];
}

function nextSyncCheckpoint(lastSyncAt, agreements) {
  const timestamps = agreements
    .map((a) => a.updatedAt || a.orderedAt || a.createdAt)
    .filter(Boolean)
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()))
    .map((d) => d.toISOString());

  if (timestamps.length > 0) {
    return timestamps.sort().at(-1);
  }

  if (lastSyncAt) return lastSyncAt;
  return null;
}

function normalizeManagerIds(managerIds) {
  const values = Array.isArray(managerIds)
    ? managerIds.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];
  return new Set(values);
}

async function queryAgreements({ dateFrom, dateTo, managerIds }) {
  if (!pool) return [];

  const managerArray = [...managerIds];
  const values = [dateFrom, dateTo];
  let where = `coalesce(created_at, ordered_at)::date >= $1::date and coalesce(created_at, ordered_at)::date <= $2::date`;

  if (managerArray.length > 0) {
    values.push(managerArray);
    where += ` and manager_id = any($3::int[])`;
  }

  const sql = `
    select
      id,
      title,
      ordered_at as "orderedAt",
      created_at as "createdAt",
      updated_at as "updatedAt",
      total,
      result,
      manager_id as "managerId",
      manager_name as "managerName",
      stage_name as "stageName",
      source_name as "sourceName",
      client_id as "clientId",
      client_name as "clientName"
    from agreements
    where ${where}
    order by id desc
  `;

  const { rows } = await pool.query(sql, values);
  return rows.map((r) => ({
    ...r,
    total: Number(r.total) || 0
  }));
}

async function upsertAgreements(agreements) {
  if (!pool || agreements.length === 0) return;
  const client = await pool.connect();

  try {
    await client.query("begin");

    const chunkSize = 250;
    for (let i = 0; i < agreements.length; i += chunkSize) {
      const chunk = agreements.slice(i, i + chunkSize);
      const values = [];
      const placeholders = chunk.map((a, index) => {
        const start = index * 14;
        values.push(
          a.id,
          a.title,
          toPgTimestamp(a.orderedAt),
          toPgTimestamp(a.createdAt),
          toPgTimestamp(a.updatedAt),
          Number(a.total) || 0,
          a.result,
          Number(a.managerId) || null,
          a.managerName,
          a.stageName,
          a.sourceName,
          Number(a.clientId) || null,
          a.clientName,
          JSON.stringify(a.raw ?? {})
        );

        return `($${start + 1},$${start + 2},$${start + 3},$${start + 4},$${start + 5},$${start + 6},$${start + 7},$${start + 8},$${start + 9},$${start + 10},$${start + 11},$${start + 12},$${start + 13},$${start + 14}::jsonb, now())`;
      });

      const sql = `
        insert into agreements (
          id, title, ordered_at, created_at, updated_at, total, result,
          manager_id, manager_name, stage_name, source_name,
          client_id, client_name, raw_json, synced_at
        ) values
          ${placeholders.join(",")}
        on conflict (id) do update set
          title = excluded.title,
          ordered_at = excluded.ordered_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          total = excluded.total,
          result = excluded.result,
          manager_id = excluded.manager_id,
          manager_name = excluded.manager_name,
          stage_name = excluded.stage_name,
          source_name = excluded.source_name,
          client_id = excluded.client_id,
          client_name = excluded.client_name,
          raw_json = excluded.raw_json,
          synced_at = now()
        where agreements.updated_at is null
          or excluded.updated_at is null
          or excluded.updated_at >= agreements.updated_at
      `;

      await client.query(sql, values);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function toPgTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function getLastSyncAt() {
  if (!pool) return null;
  const { rows } = await pool.query(`select value from sync_state where key = 'agreements_last_sync_at' limit 1`);
  return rows[0]?.value || null;
}

async function setLastSyncAt(value) {
  if (!pool) return;
  await pool.query(
    `
      insert into sync_state (key, value, updated_at)
      values ('agreements_last_sync_at', $1, now())
      on conflict (key) do update set
        value = excluded.value,
        updated_at = now()
    `,
    [value]
  );
}

async function ensureDbSchema() {
  if (!pool) return;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const sqlPath = path.join(__dirname, "sql", "001_init.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

async function insertSyncLog({
  startedAt,
  finishedAt,
  status,
  dateFrom,
  dateTo,
  managerIds,
  loadedCount,
  sourceLoadedCount,
  errorMessage
}) {
  if (!pool) return;

  try {
    const safeStarted = startedAt instanceof Date ? startedAt : new Date();
    const safeFinished = finishedAt instanceof Date ? finishedAt : new Date();
    const durationMs = Math.max(0, safeFinished.getTime() - safeStarted.getTime());
    const managerIdsText = normalizeManagerIdsForLog(managerIds);

    await pool.query(
      `
        insert into sync_logs (
          started_at,
          finished_at,
          duration_ms,
          status,
          date_from,
          date_to,
          manager_ids,
          loaded_count,
          source_loaded_count,
          error_message
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        safeStarted.toISOString(),
        safeFinished.toISOString(),
        durationMs,
        status,
        dateFrom || null,
        dateTo || null,
        managerIdsText,
        Number(loadedCount) || 0,
        Number(sourceLoadedCount) || 0,
        errorMessage || null
      ]
    );
  } catch (error) {
    console.error("Failed to write sync log", error);
  }
}

function normalizeManagerIdsForLog(managerIds) {
  if (!Array.isArray(managerIds)) return null;
  const ids = managerIds
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => String(v));
  return ids.join(",");
}

function normalizePeriodType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "week" || normalized === "month") return normalized;
  return null;
}

async function getSyncLogs(limit) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `
      select
        id,
        started_at as "startedAt",
        finished_at as "finishedAt",
        duration_ms as "durationMs",
        round(duration_ms / 1000.0, 2) as "durationSec",
        status,
        date_from as "dateFrom",
        date_to as "dateTo",
        manager_ids as "managerIds",
        loaded_count as "loadedCount",
        source_loaded_count as "sourceLoadedCount",
        error_message as "errorMessage"
      from sync_logs
      order by started_at desc
      limit $1
    `,
    [limit]
  );
  return rows;
}

async function isDbReady() {
  if (!pool) return false;
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

function isOriginAllowed(origin, configValue) {
  if (!origin) return true;
  if (!configValue || configValue === "*") return true;

  const rules = String(configValue)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  return rules.some((rule) => matchesOriginRule(origin, rule));
}

function matchesOriginRule(origin, rule) {
  if (rule === "*") return true;
  if (rule === origin) return true;

  if (rule.includes("*")) {
    const escaped = rule
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    const pattern = new RegExp(`^${escaped}$`);
    return pattern.test(origin);
  }

  return false;
}

function requireAuth(req) {
  const authHeader = String(req.headers?.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    throw new Error("Не авторизовано.");
  }

  try {
    return jwt.verify(token, authJwtSecret);
  } catch {
    throw new Error("Сесія невалідна або протермінована.");
  }
}

function isAuthError(error) {
  const message = String(error?.message || "");
  return message.includes("Не авторизовано") || message.includes("Сесія невалідна");
}

function signAuthToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      fullName: user.fullName || null,
      isAdmin: Boolean(user.isAdmin)
    },
    authJwtSecret,
    { expiresIn: authJwtExpiresIn }
  );
}

(async () => {
  try {
    if (pool) {
      await ensureDbSchema();
      console.log("Database schema is ready");
    } else {
      console.log("DATABASE_URL is not set. Running without DB cache.");
    }

    app.listen(port, () => {
      console.log(`CRMTeamLid backend listening on :${port}`);
    });
  } catch (error) {
    console.error("Failed to start backend", error);
    process.exit(1);
  }
})();
