import Fastify from "fastify";
import cors from "@fastify/cors";
import pkg from "pg";
import { z } from "zod";
import { WebSocketServer } from "ws";

// Pool de PostgreSQL
const { Pool } = pkg;

// Crear servidor Fastify
const servidor = Fastify({ logger: true });

// Habilitar CORS
await servidor.register(cors, { origin: "*" });

// Conexión a la base de datos
const bd = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:root@localhost:5432/mapeo_solar",
});

// Validación del rango (dia / semana / mes)
const esquemaRango = z.enum(["day", "week", "month"]);

//  ENDPOINT HEATMAP

servidor.get("/api/heatmap", async (_req, _reply) => {
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

//  2) ENDPOINT TIEMPO

servidor.get("/api/series", async (req, _reply) => {
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

//  ENDPOINT REPORTES

servidor.get("/api/reports", async (req, _reply) => {
  const validado = esquemaRango.safeParse(req.query.range);
  const rango = validado.success ? validado.data : "day";

  // Selección automática de la vista materializada
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

  // Convertimos a números
  return rows.map((r) => ({
    ...r,
    avg: Number(r.avg),
    max: Number(r.max),
    min: Number(r.min),
  }));
});

//  4) ENDPOINT: INSERTAR LECTURAS DESDE ESP32

servidor.post("/api/lecturas", async (req, reply) => {
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
    return reply
      .code(500)
      .send({ ok: false, error: "Error al insertar lectura" });
  }
});

//  WEBSOCKET NO FUNCIONAL DEMO

const wsServidor = new WebSocketServer({ noServer: true });

servidor.server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wsServidor.handleUpgrade(req, socket, head, (ws) => {
      ws.send(
        JSON.stringify({
          tipo: "hola",
          ts: new Date().toISOString(),
        })
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
