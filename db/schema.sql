-- ================================
--   TABLA DE SENSORES
-- ================================

CREATE TABLE IF NOT EXISTS sensores (
  id SERIAL PRIMARY KEY,
  etiqueta TEXT,             -- label
  fila INT NOT NULL,         -- row
  columna INT NOT NULL,      -- col
  direccion TEXT,            -- address
  creado_en TIMESTAMPTZ DEFAULT now()
);

-- ================================
--   TABLA DE LECTURAS
-- ================================

CREATE TABLE IF NOT EXISTS lecturas (
  id BIGSERIAL PRIMARY KEY,
  sensor_id INT REFERENCES sensores(id) ON DELETE CASCADE,
  lux NUMERIC NOT NULL,
  lux_bruto NUMERIC,         -- raw_lux
  temp_c NUMERIC,            -- temperatura en °C
  ts TIMESTAMPTZ NOT NULL,
  UNIQUE(sensor_id, ts)
);

-- ================================
--   TABLA DE CALIBRACION
-- ================================

CREATE TABLE IF NOT EXISTS calibracion (
  sensor_id INT PRIMARY KEY REFERENCES sensores(id) ON DELETE CASCADE,
  offset NUMERIC DEFAULT 0,
  ganancia NUMERIC DEFAULT 1,     -- gain
  actualizado_en TIMESTAMPTZ DEFAULT now()
);

-- ================================
--   TABLA DE ALERTAS
-- ================================

CREATE TABLE IF NOT EXISTS alertas (
  id BIGSERIAL PRIMARY KEY,
  regla TEXT,
  sensor_id INT REFERENCES sensores(id),
  estado TEXT CHECK (estado IN ('open','closed')) DEFAULT 'open',
  inicio_en TIMESTAMPTZ DEFAULT now(),
  fin_en TIMESTAMPTZ,
  notas TEXT
);

-- ================================
--   INDICES
-- ================================

CREATE INDEX IF NOT EXISTS idx_lecturas_ts 
  ON lecturas(ts);

CREATE INDEX IF NOT EXISTS idx_lecturas_sensor_ts 
  ON lecturas(sensor_id, ts DESC);
