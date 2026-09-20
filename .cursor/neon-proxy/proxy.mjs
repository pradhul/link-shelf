// Local Neon HTTP proxy for offline development.
//
// The application talks to Postgres through @neondatabase/serverless (the Neon
// serverless driver), which issues queries as HTTPS POSTs to `https://<host>/sql`
// instead of a normal TCP connection. In production that endpoint is Neon's cloud
// proxy. For local development this small server implements the same wire protocol
// and forwards queries to a plain local Postgres via node-postgres.
//
// It is intentionally environment-only tooling: the application code is unchanged
// and unaware this proxy exists. It just points at a local DATABASE_URL host.

import fs from "node:fs";
import https from "node:https";
import pg from "node:process";
import { Pool } from "pg";

const PORT = Number(process.env.NEON_PROXY_PORT || 443);
const HOST = process.env.NEON_PROXY_HOST || "0.0.0.0";
const PG_CONNECTION_STRING =
  process.env.PG_CONNECTION_STRING ||
  "postgres://shelf:shelf@127.0.0.1:5432/linkshelf";
const KEY_PATH = process.env.NEON_PROXY_KEY || "/etc/neon-local-proxy/key.pem";
const CERT_PATH = process.env.NEON_PROXY_CERT || "/etc/neon-local-proxy/cert.pem";

// The driver requests `Neon-Raw-Text-Output: true`, so it expects every column
// value as its raw Postgres text representation and re-parses it client-side.
// Returning identity parsers from node-postgres gives us those raw strings.
const rawTypeParsers = { getTypeParser: () => (value) => value };

const pool = new Pool({ connectionString: PG_CONNECTION_STRING, max: 20 });

// Fields the Neon serverless driver copies off a 400 error response.
const PG_ERROR_FIELDS = [
  "severity",
  "code",
  "detail",
  "hint",
  "position",
  "internalPosition",
  "internalQuery",
  "where",
  "schema",
  "table",
  "column",
  "dataType",
  "constraint",
  "file",
  "line",
  "routine",
];

function formatResult(result) {
  return {
    command: result.command,
    rowCount: result.rowCount,
    rows: result.rows, // arrays of raw text (rowMode: "array")
    fields: (result.fields || []).map((f) => ({
      name: f.name,
      dataTypeID: f.dataTypeID,
      tableID: f.tableID,
      columnID: f.columnID,
      dataTypeSize: f.dataTypeSize,
      dataTypeModifier: f.dataTypeModifier,
      format: f.format,
    })),
    rowAsArray: true,
  };
}

async function runQuery(client, q) {
  return client.query({
    text: q.query,
    values: q.params || [],
    rowMode: "array",
    types: rawTypeParsers,
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function errorPayload(err) {
  const payload = { message: err.message };
  for (const field of PG_ERROR_FIELDS) {
    if (err[field] !== undefined) payload[field] = err[field];
  }
  return payload;
}

async function handleSql(req, res, rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return sendJson(res, 400, { message: "Invalid JSON body" });
  }

  // Batch mode (array of queries) runs inside a single transaction, matching
  // Neon's batch endpoint used by the serverless driver's transaction() helper.
  if (Array.isArray(payload.queries)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const q of payload.queries) {
        results.push(formatResult(await runQuery(client, q)));
      }
      await client.query("COMMIT");
      return sendJson(res, 200, { results });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return sendJson(res, 400, errorPayload(err));
    } finally {
      client.release();
    }
  }

  const client = await pool.connect();
  try {
    const result = await runQuery(client, payload);
    return sendJson(res, 200, formatResult(result));
  } catch (err) {
    return sendJson(res, 400, errorPayload(err));
  } finally {
    client.release();
  }
}

const server = https.createServer(
  { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) },
  (req, res) => {
    const url = req.url || "";
    if (req.method === "GET" && (url === "/health" || url === "/")) {
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== "POST" || !url.startsWith("/sql")) {
      return sendJson(res, 404, { message: "Not found" });
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      handleSql(req, res, body).catch((err) =>
        sendJson(res, 500, { message: String(err?.message || err) }),
      );
    });
  },
);

server.listen(PORT, HOST, () => {
  console.log(
    `[neon-local-proxy] listening https://${HOST}:${PORT}/sql -> ${PG_CONNECTION_STRING.replace(/:[^:@/]*@/, ":***@")}`,
  );
});

function shutdown() {
  server.close(() => pool.end().finally(() => pg.exit(0)));
  setTimeout(() => pg.exit(0), 3000).unref();
}
pg.on("SIGTERM", shutdown);
pg.on("SIGINT", shutdown);
