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

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

const API_BASE_URL = "http://localhost:3000";

export default function GraficaHoras({ sensorId = 1 }) {
  const [datos, setDatos] = useState([]);
  const [rangoHoras, setRangoHoras] = useState(1); // 6, 12, 24, etc.
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    try {
      setCargando(true);

      // Calculamos "from" = ahora - rangoHoras
      const ahora = new Date();
      const desde = new Date(
        ahora.getTime() - rangoHoras * 60 * 60 * 1000
      ).toISOString(); // ISO para que Postgres lo entienda

      const url = `${API_BASE_URL}/api/series?sensorId=${sensorId}&from=${encodeURIComponent(
        desde
      )}`;

      const res = await fetch(url);
      if (!res.ok) {
        console.error("Error al cargar /api/series", res.status);
        setDatos([]);
        return;
      }

      const d = await res.json();
      setDatos(d);
    } catch (e) {
      console.error("Error al cargar /api/series", e);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, [sensorId, rangoHoras]);

  const labels = datos.map((d) =>
    new Date(d.ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const valores = datos.map((d) => d.lux);

  const data = {
    labels,
    datasets: [
      {
        label: `Lux del sensor ${sensorId}`,
        data: valores,
        borderColor: "rgb(16, 185, 129)",
        backgroundColor: "rgba(16, 185, 129, 0.3)",
        borderWidth: 2,
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        labels: { color: "#e5e7eb" },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y} lx`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#9ca3af" },
      },
      y: {
        ticks: { color: "#9ca3af" },
      },
    },
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Intensidad por hora</h3>

        {/* Selector de rango */}
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
        <div className="text-xs text-slate-400 mb-2">
          Cargando datos…
        </div>
      )}

      {datos.length === 0 ? (
        <div className="text-xs text-slate-400">
          Sin lecturas en las últimas {rangoHoras} horas.
        </div>
      ) : (
        <Line data={data} options={options} />
      )}
    </div>
  );
}
