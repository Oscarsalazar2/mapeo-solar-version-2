import React, { useEffect, useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

const API_BASE_URL = "http://localhost:3000";

// 👇 AQUÍ CAMBIAS LOS MINUTOS DEL BLOQUE
const INTERVALO_MINUTOS = 2; // 1, 2, 5, 10, etc.

const COLORES = [
  "rgba(16, 185, 129, 1)",   // verde
  "rgba(59, 130, 246, 1)",   // azul
  "rgba(244, 114, 182, 1)",  // rosa
  "rgba(234, 179, 8, 1)",    // amarillo
  "rgba(56, 189, 248, 1)",   // celeste
  "rgba(249, 115, 22, 1)",   // naranja
  "rgba(139, 92, 246, 1)",   // morado
  "rgba(45, 212, 191, 1)",   // turquesa
  "rgba(248, 113, 113, 1)",  // rojo suave
];

// =========================
// Agrupar lecturas cada N min
// lecturas: [{ ts: Date, lux: number }]
// =========================
function agruparCadaNMin(lecturas, nMin) {
  const buckets = {};

  for (const d of lecturas) {
    const t = d.ts instanceof Date ? d.ts : new Date(d.ts);
    const minutos = t.getMinutes();
    const bucketMin = minutos - (minutos % nMin); // bloque de nMin minutos

    const tsBucket = new Date(
      t.getFullYear(),
      t.getMonth(),
      t.getDate(),
      t.getHours(),
      bucketMin,
      0,
      0
    );
    const clave = tsBucket.getTime(); // usamos el timestamp como clave

    if (!buckets[clave]) {
      buckets[clave] = { ts: tsBucket, sum: 0, count: 0 };
    }
    buckets[clave].sum += d.lux;
    buckets[clave].count++;
  }

  return Object.values(buckets)
    .map((b) => ({
      ts: b.ts,               // 👈 siempre un Date
      lux: b.sum / b.count,
    }))
    .sort((a, b) => a.ts - b.ts);
}

export default function GraficaGeneral({
  sensorIds = [1, 2, 3, 4, 5, 6, 7, 8, 9],
  rangoHoras,
}) {
  const [series, setSeries] = useState([]);

  useEffect(() => {
    async function cargar() {
      try {
        const respuestas = await Promise.all(
          sensorIds.map((id) =>
            fetch(`${API_BASE_URL}/api/series?sensorId=${id}`)
          )
        );

        const jsons = await Promise.all(respuestas.map((r) => r.json()));

        const ahoraMs = Date.now();
        const limiteMs = ahoraMs - rangoHoras * 60 * 60 * 1000;

        const datosPorSensor = sensorIds.map((id, index) => {
          const raw = jsons[index];

          if (!Array.isArray(raw)) {
            console.warn(`Sensor ${id} regresó datos inválidos:`, raw);
            return { sensorId: id, lecturas: [] };
          }

          // Convertimos ts a Date aquí
          const lecturasOriginales = raw
            .map((l) => ({
              ts: new Date(l.ts),
              lux: Number(l.lux),
            }))
            .filter(
              (l) =>
                l.ts instanceof Date &&
                !isNaN(l.ts) &&
                l.ts.getTime() >= limiteMs
            );

          // AGRUPAMOS POR INTERVALO_MINUTOS
          const lecturasAgrupadas = agruparCadaNMin(
            lecturasOriginales,
            INTERVALO_MINUTOS
          );

          return { sensorId: id, lecturas: lecturasAgrupadas };
        });

        setSeries(datosPorSensor);
      } catch (e) {
        console.error("Error al cargar series generales", e);
      }
    }

    cargar();
  }, [sensorIds, rangoHoras]);

  // Labels basados en la 1a serie
  const labels = useMemo(() => {
    const base = series[0]?.lecturas || [];
    return base.map((l) =>
      l.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  }, [series]);

  const data = useMemo(() => {
    return {
      labels,
      datasets: series.map((serie, idx) => ({
        label: `Sensor ${serie.sensorId}`,
        data: serie.lecturas.map((l) => l.lux),
        borderColor: COLORES[idx % COLORES.length],
        backgroundColor: COLORES[idx % COLORES.length].replace(
          ", 1)",
          ", 0.25)"
        ),
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 2,
      })),
    };
  }, [labels, series]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#e5e7eb", boxWidth: 16, font: { size: 10 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y} lx`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#9ca3af",
          autoSkip: true,
          maxTicksLimit: 8,
        },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: "#9ca3af",
          maxTicksLimit: 6,
        },
        grid: { display: false },
      },
    },
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold mb-2">
        Intensidad por hora general
      </h3>
      {labels.length ? (
        <div className="h-56 sm:h-64">
          <Line data={data} options={options} />
        </div>
      ) : (
        <div className="text-xs text-slate-300">
          Sin lecturas en el rango seleccionado.
        </div>
      )}
    </div>
  );
}
