import React, { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const FILAS = 3;
const COLUMNAS = 3;
const OBJETIVO_LUX = 500;

// Helpers
const limitar = (valor, min, max) => Math.max(min, Math.min(max, valor));

const formatearLux = (valorLux) =>
  valorLux >= 1000
    ? `${(valorLux / 1000).toFixed(1)}k lx`
    : `${Math.round(valorLux)} lx`;

function colorMapaCalor(valorRel) {
  const v = limitar(valorRel, 0, 2);
  if (v <= 0.5) {
    const t = v / 0.5;
    return `rgb(255,${Math.round(255 * t)},0)`; // rojo → amarillo
  }
  const t = (v - 0.5) / 1.5;
  return `rgb(${Math.round(255 * (1 - t))},${Math.round(255 - 85 * t)},0)`; // amarillo → verde
}

export default function MapaSensores({ cuadricula }) {
  const celdas = useMemo(() => cuadricula.flat(), [cuadricula]);

  if (!celdas.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
        Sin datos aún. Esperando lecturas de los sensores…
      </div>
    );
  }

  const maxLux = Math.max(...celdas.map((c) => c.lux), 1);
  const sensorMax = celdas.reduce(
    (mejor, celda) => (celda.lux > mejor.lux ? celda : mejor),
    celdas[0]
  );
  const umbralBajo = maxLux * 0.6;
  const sensoresBajos = celdas.filter((c) => c.lux < umbralBajo);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Mapa del invernadero</h2>

      {/* CONTENEDOR DEL MAPA + TU CUADRÍCULA */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900/60 p-4 overflow-hidden">
        <div className="text-xs text-slate-300 mb-2">Luis gei</div>

        {/* MAPA DE FONDO (FIJO, SIN MOVERSE) */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-25">
          <MapContainer
            center={[25.84022, -97.505206]}
            zoom={20}
            zoomControl={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            dragging={false}
            style={{ width: "100%", height: "100%" }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </MapContainer>
        </div>

        {/* TU GRID ENCIMA DEL MAPA */}
        <div
          className="relative z-10 grid h-full w-full"
          style={{
            gridTemplateRows: `repeat(${FILAS}, 1fr)`,
            gridTemplateColumns: `repeat(${COLUMNAS}, 1fr)`,
            gap: "8px",
            padding: "10px",
          }}
        >
          {cuadricula.map((fila) =>
            fila.map((celda) => {
              const relMax = celda.lux / maxLux;
              const color = colorMapaCalor(celda.lux / OBJETIVO_LUX);

              return (
                <div
                  key={celda.id}
                  className="relative flex items-center justify-center rounded-xl backdrop-blur-sm"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.07), transparent 70%)",
                    border: "1px solid rgba(148, 163, 184, 0.45)",
                  }}
                >
                  <div
                    className="flex flex-col items-center justify-center rounded-full shadow-md"
                    style={{
                      backgroundColor: color,
                      width: `${32 + relMax * 16}px`,
                      height: `${32 + relMax * 16}px`,
                      border: "2px solid rgba(15, 23, 42, 0.9)",
                    }}
                  >
                    <span className="text-[10px] font-semibold text-slate-900">
                      {celda.id}
                    </span>
                    <span className="text-[9px] text-slate-900/80">
                      {formatearLux(celda.lux)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RECOMENDACIONES */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-200 space-y-2">
        <h3 className="text-sm font-semibold mb-1">
          Recomendación de reubicación de plantas
        </h3>

        <p className="text-slate-300">
          El sensor con mayor luminosidad registrada es{" "}
          <strong>{sensorMax.id}</strong> con{" "}
          <strong>{formatearLux(sensorMax.lux)}</strong>.
        </p>

        {sensoresBajos.length === 0 ? (
          <p className="text-emerald-300">
            Todos los sensores están en un rango similar de iluminación.
          </p>
        ) : (
          <>
            <p>Sensores con menos del 60% de luz:</p>
            <ul className="list-disc list-inside text-slate-300">
              {sensoresBajos.map((c) => (
                <li key={c.id}>
                  <strong>{c.id}</strong> — {formatearLux(c.lux)}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-emerald-300">
              Sugerencia: reubicar plantas de estos sensores hacia la zona
              cercana a <strong>{sensorMax.id}</strong>, donde se registra la
              mayor intensidad lumínica.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
