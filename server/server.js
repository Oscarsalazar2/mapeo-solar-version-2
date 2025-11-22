import Fastify from "fastify";
import cors from "@fastify/cors";
import pkg from "pg";
import { z } from "zod";
import { WebSocketServer } from "ws";

const { Pool } = pkg;

// =======================
// ⚡ MODO DEMO
// =======================
const DEMO_MODE = true; // ← CAMBIA A false CUANDO YA USES LA BD REAL
const FILAS = 3;
const COLUMNAS = 3;

// Generar grid demo
function generarHeatmapDemo() {
  const rows = [];
  let id = 1;

  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLUMNAS; c++) {
      const lux = 15000 + Math.random() * 15000;

      rows.push({
        id,
        etiqueta: `S${id}`,
        fila: f,
        columna: c,
        lux: Math.round(lux),
        ts: new Date().toISOString(),
      });

      id++;
    }
  }

  return rows;
}

// Series demo
function generarSeriesDemo(sensorId) {
  const puntos = [];
  const ahora = Date.now();
  const pasoMin = 10;
  const totalMin = 6 * 60; // 6 horas

  for (let min = totalMin; min >= 0; min -= pasoMin) {
    const ts = new Date(ahora - min * 60000).toISOString();
    const base = 15000 + Math.random() * 15000;
    const offset = (sensorId - 5) * 1000;
    const ruido = (Math.random() - 0.5) * 2000;

    puntos.push({
      ts,
      lux: Math.max(0, Math.round(base + offset + ruido)),
    });
  }

  return puntos;
}

// Reportes demo
function generarReportesDemo(rango) {
  const partes = rango === "day" ? 24 : rango === "week" ? 7 : 30;

  return Array.from({ length: partes }).map((_, i) => {
    const avg = 15000 + Math.random() * 15000;
    const min = avg - (2000 + Math.random() * 2000);
    const max = avg + (2000 + Math.random() * 2000);

    return {
      key: rango === "day" ? `${i.toString().padStart(2, "0")}:00` : `Per ${i + 1}`,
      avg: Math.round(avg),
      min: Math.round(Math.max(min, 0)),
      max: Math.round(max),
    };
  });
}

// =======================
// 🔥 Servidor Fastify
// =======================

const servidor = Fastify({ logger: true });

await servidor.register(cors, { origin: "*" });

// BD REAL (solo se usa cuando DEMO = false)
const bd = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:root@localhost:5432/mapeo_solar",
});

// Validación del rango
const esquemaRango = z.enum(["day", "week", "month"]);

// =======================
// 🔥 ENDPOINT HEATMAP
// =======================

servidor.get("/api/heatmap", async (_req, _reply) => {
  if (DEMO_MODE) {
    return { grid: generarHeatmapDemo() };
  }

  const { rows } = await bd.query(`
    SELECT s.id, s.etiqueta, s.fila, s.columna, r.lux, r.ts
    FROM sensores s
    JOIN LATERAL (
      SELECT lux, ts
      FROM lecturas
      WHERE sensor_id = s.id
      ORDER BY ts DESC
      LIMIT 1
    ) r ON TRUE
    ORDER BY s.fila, s.columna
  `);

  return { grid: rows };
});

// =======================
// 🔥 ENDPOINT SERIES POR SENSOR
// =======================

servidor.get("/api/series", async (req, _reply) => {
  const id = Number(req.query.sensorId || 1);

  if (DEMO_MODE) {
    return generarSeriesDemo(id);
  }

  const { sensorId, from, to } = req.query;

  const consulta = `
    SELECT ts, lux
    FROM lecturas
    WHERE sensor_id = $1
      AND ts >= COALESCE($2, '-infinity')
      AND ts <= COALESCE($3, 'infinity')
    ORDER BY ts ASC
  `;

  const { rows } = await bd.query(consulta, [sensorId, from, to]);
  return rows;
});

// =======================
// 🔥 ENDPOINT REPORTES
// =======================

servidor.get("/api/reports", async (req, _reply) => {
  const validado = esquemaRango.safeParse(req.query.range);
  const rango = validado.success ? validado.data : "day";

  if (DEMO_MODE) {
    return generarReportesDemo(rango);
  }

  const vista =
    rango === "day"
      ? "lecturas_dia"
      : rango === "week"
      ? "lecturas_semana"
      : "lecturas_mes";

  const { rows } = await bd.query(`
    SELECT periodo AS key,
           promedio AS avg,
           maximo AS max,
           minimo AS min
    FROM ${vista}
    ORDER BY periodo ASC
  `);

  return rows.map((r) => ({
    ...r,
    avg: Number(r.avg),
    max: Number(r.max),
    min: Number(r.min),
  }));
});

// =======================
// 🔥 ENDPOINT INSERTAR (ESP32)
// =======================

servidor.post("/api/lecturas", async (req, reply) => {
  if (DEMO_MODE) {
    return reply.send({ ok: true, id: 999 }); // solo éxito falso
  }

  const { sensor_id, lux } = req.body || {};

  if (!sensor_id || lux === undefined || lux === null) {
    return reply
      .code(400)
      .send({ ok: false, error: "sensor_id y lux son requeridos" });
  }

  try {
    const consulta = `
      INSERT INTO lecturas (sensor_id, lux, ts)
      VALUES ($1, $2, NOW())
      RETURNING id
    `;
    const { rows } = await bd.query(consulta, [sensor_id, lux]);
    return { ok: true, id: rows[0].id };
  } catch (err) {
    servidor.log.error(err);
    return reply.code(500).send({ ok: false, error: "Error al insertar lectura" });
  }
});

// =======================
// 🔥 WEBSOCKET DEMO
// =======================

const wsServidor = new WebSocketServer({ noServer: true });

servidor.server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wsServidor.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ tipo: "hola", ts: new Date().toISOString() }));
    });
  }
});

// =======================
// 🔥 INICIAR
// =======================

const puerto = process.env.PORT || 3000;

servidor.listen({ port: puerto, host: "0.0.0.0" }).catch((err) => {
  servidor.log.error(err);
  process.exit(1);
});
