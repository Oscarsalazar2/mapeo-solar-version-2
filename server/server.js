import Fastify from "fastify";
import cors from "@fastify/cors";
import pkg from "pg";
import { z } from "zod";
import { WebSocketServer } from "ws";

const { Pool } = pkg;

const DEMO_MODE = false;
const FILAS = 3;
const COLUMNAS = 3;

// =======================
// Servidor Fastify
// =======================
const servidor = Fastify({ logger: true });

await servidor.register(cors, { origin: "*" });

// =======================
// Conexión BD REAL
// =======================
const bd = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:root@localhost:5432/mapeo_solar",
});

// =======================
// ENDPOINT SERIES POR SENSOR
// =======================
servidor.get("/api/series", async (req, _reply) => {
  const sensorId = Number(req.query.sensorId || 1);
  const from = req.query.from || null;
  const to = req.query.to || null;

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


// =======================
//  ENDPOINT HEATMAP
// =======================
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


// =======================
// ENDPOINT REPORTES
// =======================
servidor.get("/api/reports", async (req, _reply) => {
  const esquemaRango = z.enum(["day", "week", "month"]);
  const validado = esquemaRango.safeParse(req.query.range);
  const rango = validado.success ? validado.data : "day";

  if (DEMO_MODE) return generarReportesDemo(rango);

  let consulta = "";

  //  dia → 24 horas

  if (rango === "day") {
    consulta = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('hour', now() - interval '23 hour'),
          date_trunc('hour', now()),
          interval '1 hour'
        ) AS slot
      ),
      agg AS (
        SELECT date_trunc('hour', ts) AS slot,
               AVG(lux) AS avg,
               MAX(lux) AS max,
               MIN(lux) AS min
        FROM lecturas
        WHERE ts >= now() - interval '24 hours'
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

  // Semana → 7 días
  else if (rango === "week") {
    consulta = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('day', now() - interval '6 day'),
          date_trunc('day', now()),
          interval '1 day'
        ) AS slot
      ),
      agg AS (
        SELECT date_trunc('day', ts) AS slot,
               AVG(lux) AS avg,
               MAX(lux) AS max,
               MIN(lux) AS min
        FROM lecturas
        WHERE ts >= now() - interval '7 day'
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


  // Mes → 30 días
  
  else {
    consulta = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('day', now() - interval '29 day'),
          date_trunc('day', now()),
          interval '1 day'
        ) AS slot
      ),
      agg AS (
        SELECT date_trunc('day', ts) AS slot,
               AVG(lux) AS avg,
               MAX(lux) AS max,
               MIN(lux) AS min
        FROM lecturas
        WHERE ts >= now() - interval '30 day'
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
  const { lecturas } = req.body || {};

  if (!lecturas || !Array.isArray(lecturas)) {
    return reply
      .code(400)
      .send({ ok: false, error: "Se requiere arreglo lecturas[]" });
  }

  try {
    for (const l of lecturas) {
      await bd.query(
        `INSERT INTO lecturas (sensor_id, lux, ts)
         VALUES ($1, $2, NOW())`,
        [l.sensor_id, l.lux]
      );
    }

    return { ok: true, count: lecturas.length };
  } catch (err) {
    servidor.log.error(err);
    return reply.code(500).send({ ok: false, error: "Error al insertar batch" });
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
      ws.send(
        JSON.stringify({ tipo: "hola", ts: new Date().toISOString() })
      );
    });
  }
});


// INICIAR SERVIDOR
const puerto = process.env.PORT || 3000;

servidor.listen({ port: puerto, host: "0.0.0.0" }).catch((err) => {
  servidor.log.error(err);
  process.exit(1);
});
