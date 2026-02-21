import Fastify from "fastify";
import cors from "@fastify/cors";
import pkg from "pg";
import { z } from "zod";
import { WebSocketServer } from "ws";

const { Pool } = pkg;

const DEMO_MODE = process.env.DEMO_MODE === "true";
const FILAS = 3;
const COLUMNAS = 3;
const puerto = Number(process.env.PORT || 3000);
const rawCorsOrigins = process.env.CORS_ORIGIN || "http://localhost:5173";
const allowedOrigins = rawCorsOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const querySeriesSchema = z.object({
  sensorId: z.coerce.number().int().positive().default(1),
  from: z.string().optional(),
  to: z.string().optional(),
});

const rangeSchema = z.enum(["day", "week", "month"]);

const lecturasBatchSchema = z.object({
  lecturas: z
    .array(
      z.object({
        sensor_id: z.coerce.number().int().positive(),
        lux: z.coerce.number().finite(),
      }),
    )
    .min(1)
    .max(500),
});

// Servidor Fastify
const servidor = Fastify({ logger: true });

await servidor.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origen no permitido por CORS"), false);
  },
});

// Conexión BD REAL
const bd = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:root@localhost:5432/mapeo_solar",
});

servidor.setErrorHandler((error, _request, reply) => {
  servidor.log.error(error);
  reply.code(500).send({ ok: false, error: "Error interno del servidor" });
});

servidor.get("/api/health", async () => ({ ok: true }));

// ENDPOINT SERIES POR SENSOR
servidor.get("/api/series", async (req, reply) => {
  const validado = querySeriesSchema.safeParse(req.query || {});
  if (!validado.success) {
    return reply.code(400).send({ ok: false, error: "Parámetros inválidos" });
  }

  const { sensorId, from, to } = validado.data;

  if (DEMO_MODE) return generarSeriesDemo(sensorId);

  const consulta = `
    SELECT ts, lux
    FROM lecturas
    WHERE sensor_id = $1
      AND ts >= COALESCE($2::timestamptz, '-infinity')
      AND ts <= COALESCE($3::timestamptz, 'infinity')
    ORDER BY ts ASC
  `;

  const { rows } = await bd.query(consulta, [sensorId, from, to]);
  return rows;
});

//  ENDPOINT HEATMAP
servidor.get("/api/heatmap", async (req, _reply) => {
  if (DEMO_MODE) {
    const demo = [];
    let id = 1;
    for (let f = 0; f < FILAS; f++) {
      for (let c = 0; c < COLUMNAS; c++) {
        demo.push({
          sensor_id: id++,
          fila: f,
          columna: c,
          lux: Math.round(Math.random() * 800),
          ts: new Date().toISOString(),
          etiqueta: `Sensor S${id - 1}`,
        });
      }
    }

    return { grid: demo };
  }

  const consulta = `
    SELECT s.id        AS sensor_id,
           s.etiqueta,
           s.fila,
           s.columna,
           l.lux,
           l.ts
    FROM sensores s
    LEFT JOIN LATERAL (
      SELECT lux, ts
      FROM lecturas
      WHERE lecturas.sensor_id = s.id
      ORDER BY ts DESC
      LIMIT 1
    ) l ON TRUE
    ORDER BY s.id;
  `;

  const { rows } = await bd.query(consulta);
  return { grid: rows };
});

// ENDPOINT REPORTES
servidor.get("/api/reports", async (req, _reply) => {
  const validado = rangeSchema.safeParse(req.query.range);
  const rango = validado.success ? validado.data : "day";

  if (DEMO_MODE) return generarReportesDemo(rango);

  let consulta = "";

  // DÍA → 00:00 a 23:00 de HOY
  if (rango === "day") {
    consulta = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('day', now()),                      -- 00:00 de hoy
          date_trunc('day', now()) + interval '23 hour', -- 23:00 de hoy
          interval '1 hour'
        ) AS slot
      ),
      agg AS (
        SELECT date_trunc('hour', ts) AS slot,
               AVG(lux) AS avg,
               MAX(lux) AS max,
               MIN(lux) AS min
        FROM lecturas
        WHERE ts >= date_trunc('day', now())
          AND ts <  date_trunc('day', now()) + interval '1 day'
        GROUP BY 1
      )
      SELECT 
        to_char(b.slot, 'HH24:00') AS key,
        COALESCE(agg.avg, 0) AS avg,
        COALESCE(agg.max, 0) AS max,
        COALESCE(agg.min, 0) AS min
      FROM buckets b
      LEFT JOIN agg ON agg.slot = b.slot
      ORDER BY b.slot;
    `;
  }

  // SEMANA (hoy y 6 días antes)
  else if (rango === "week") {
    consulta = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('day', now() - interval '6 day'),  -- hace 6 días
          date_trunc('day', now()),                     -- hoy
          interval '1 day'
        ) AS slot
      ),
      agg AS (
        SELECT date_trunc('day', ts) AS slot,
               AVG(lux) AS avg,
               MAX(lux) AS max,
               MIN(lux) AS min
        FROM lecturas
        WHERE ts >= date_trunc('day', now() - interval '6 day')
          AND ts <  date_trunc('day', now()) + interval '1 day'
        GROUP BY 1
      )
      SELECT 
        to_char(b.slot, 'YYYY-MM-DD') AS key,
        COALESCE(agg.avg, 0) AS avg,
        COALESCE(agg.max, 0) AS max,
        COALESCE(agg.min, 0) AS min
      FROM buckets b
      LEFT JOIN agg ON agg.slot = b.slot
      ORDER BY b.slot;
    `;
  }

  // MES → últimos 30 días (hoy y 29 días antes)
  else {
    consulta = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('day', now() - interval '29 day'), -- hace 29 días
          date_trunc('day', now()),                     -- hoy
          interval '1 day'
        ) AS slot
      ),
      agg AS (
        SELECT date_trunc('day', ts) AS slot,
               AVG(lux) AS avg,
               MAX(lux) AS max,
               MIN(lux) AS min
        FROM lecturas
        WHERE ts >= date_trunc('day', now() - interval '29 day')
          AND ts <  date_trunc('day', now()) + interval '1 day'
        GROUP BY 1
      )
      SELECT 
        to_char(b.slot, 'YYYY-MM-DD') AS key,
        COALESCE(agg.avg, 0) AS avg,
        COALESCE(agg.max, 0) AS max,
        COALESCE(agg.min, 0) AS min
      FROM buckets b
      LEFT JOIN agg ON agg.slot = b.slot
      ORDER BY b.slot;
    `;
  }

  const { rows } = await bd.query(consulta);

  return rows.map((r) => ({
    key: r.key,
    avg: Number(r.avg),
    max: Number(r.max),
    min: Number(r.min),
  }));
});

// ENDPOINT BATCH DESDE ESP32

servidor.post("/api/lecturas-multi", async (req, reply) => {
  const validado = lecturasBatchSchema.safeParse(req.body || {});
  if (!validado.success) {
    return reply.code(400).send({
      ok: false,
      error: "Se requiere arreglo lecturas[] válido (1-500 elementos)",
    });
  }

  const { lecturas } = validado.data;

  try {
    const sensorIds = lecturas.map((l) => l.sensor_id);
    const luxValues = lecturas.map((l) => l.lux);

    await bd.query(
      `INSERT INTO lecturas (sensor_id, lux, ts)
       SELECT t.sensor_id, t.lux, clock_timestamp()
       FROM unnest($1::int[], $2::numeric[]) AS t(sensor_id, lux)`,
      [sensorIds, luxValues],
    );

    return { ok: true, count: lecturas.length };
  } catch (err) {
    servidor.log.error(err);
    return reply
      .code(500)
      .send({ ok: false, error: "Error al insertar batch" });
  }
});

//     GET /api/lecturas/latest
servidor.get("/api/lecturas/latest", async (req, _reply) => {
  const consulta = `
    SELECT 
      l.id,
      l.sensor_id,
      s.etiqueta,
      l.lux,
      l.ts
    FROM lecturas l
    LEFT JOIN sensores s ON s.id = l.sensor_id
    ORDER BY l.ts DESC
    LIMIT 9
  `;

  const { rows } = await bd.query(consulta);

  return rows.map((r) => ({
    id: r.id,
    sensor_id: r.sensor_id,
    etiqueta: r.etiqueta,
    lux: Number(r.lux),
    ts: r.ts,
  }));
});

//  WEBSOCKET (DEMO)

const wsServidor = new WebSocketServer({ noServer: true });

servidor.server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wsServidor.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ tipo: "hola", ts: new Date().toISOString() }));
    });
  }
});

// INICIAR SERVIDOR
async function cerrarServidor(signal) {
  servidor.log.info({ signal }, "Cerrando servidor...");
  await servidor.close();
  await bd.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void cerrarServidor("SIGINT");
});

process.on("SIGTERM", () => {
  void cerrarServidor("SIGTERM");
});

servidor.listen({ port: puerto, host: "0.0.0.0" }).catch((err) => {
  servidor.log.error(err);
  process.exit(1);
});
