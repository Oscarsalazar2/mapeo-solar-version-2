import React, { useEffect, useState } from "react";
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
import { API_BASE_URL } from "../config/api";
import { fetchJson } from "../lib/http";
import useDebouncedValue from "../hooks/useDebouncedValue";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const INTERVALO_MINUTOS = 1; // Minutos

// Agrupar lecturas cada N min
function agruparCadaNMin(datos, nMin) {
  const buckets = {};

  for (const d of datos) {
    const t = new Date(d.ts);
    const minutos = t.getMinutes();
    const bucketMin = minutos - (minutos % nMin); //  AGRUPA EN BLOQUES

    const clave = new Date(
      t.getFullYear(),
      t.getMonth(),
      t.getDate(),
      t.getHours(),
      bucketMin,
      0,
      0,
    ).toISOString();

    if (!buckets[clave]) {
      buckets[clave] = { ts: clave, sum: 0, count: 0 };
    }
    buckets[clave].sum += d.lux;
    buckets[clave].count++;
  }

  return Object.values(buckets)
    .map((b) => ({
      ts: b.ts,
      lux: b.sum / b.count,
    }))
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

export default function GraficaHoras({ sensorId = 1 }) {
  const [datos, setDatos] = useState([]);
  const [rangoHoras, setRangoHoras] = useState(1);
  const [cargando, setCargando] = useState(false);
  const rangoHorasDebounced = useDebouncedValue(rangoHoras, 220);

  async function cargar(signal) {
    try {
      setCargando(true);

      const ahora = new Date();
      const desde = new Date(
        ahora.getTime() - rangoHorasDebounced * 60 * 60 * 1000,
      ).toISOString();

      const json = await fetchJson(
        `${API_BASE_URL}/api/series?sensorId=${sensorId}&from=${encodeURIComponent(
          desde,
        )}`,
        {
          timeoutMs: 5000,
          retries: 2,
          cacheTtlMs: 5000,
          signal,
        },
      );
      if (!signal?.aborted) {
        setDatos(json);
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.error("Error al cargar /api/series", e);
      }
    } finally {
      if (!signal?.aborted) {
        setCargando(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    cargar(controller.signal);

    return () => {
      controller.abort();
    };
  }, [sensorId, rangoHorasDebounced]);

  // AGRUPAR DATOS
  const datosAgrupados = agruparCadaNMin(datos, INTERVALO_MINUTOS);

  const labels = datosAgrupados.map((d) =>
    new Date(d.ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const valores = datosAgrupados.map((d) => d.lux);

  const muchosPuntos = datosAgrupados.length > 80;

  const data = {
    labels,
    datasets: [
      {
        label: `Lux del sensor`,
        data: valores,
        borderColor: "rgb(16, 185, 129)",
        backgroundColor: "rgba(16, 185, 129, 0.3)",
        borderWidth: 2,
        tension: 0.3,
        pointRadius: muchosPuntos ? 0 : 2,
      },
    ],
  };

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
          maxTicksLimit: 6,
        },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: "#9ca3af",
          maxTicksLimit: 5,
        },
        grid: { display: false },
      },
    },
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Sensor {sensorId}</h3>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-300">Rango:</span>
          <select
            value={rangoHoras}
            onChange={(e) => setRangoHoras(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
          >
            <option value={1}>Última 1 h</option>
            <option value={6}>Últimas 6 h</option>
            <option value={12}>Últimas 12 h</option>
            <option value={24}>Últimas 24 h</option>
          </select>
        </div>
      </div>

      {cargando && (
        <div className="text-xs text-slate-400 mb-2">Cargando datos…</div>
      )}

      {datosAgrupados.length === 0 ? (
        <div className="text-xs text-slate-400">
          Sin lecturas en las últimas {rangoHoras} horas.
        </div>
      ) : (
        <div className="mt-1 h-40 sm:h-48">
          <Line data={data} options={options} />
        </div>
      )}
    </div>
  );
}
