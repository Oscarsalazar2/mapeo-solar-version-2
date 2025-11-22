-- ================================
--  VISTA MATERIALIZADA: POR DIA
-- ================================

CREATE MATERIALIZED VIEW IF NOT EXISTS lecturas_dia AS
SELECT 
  date_trunc('day', ts) AS periodo,
  AVG(lux)  AS promedio,
  MAX(lux)  AS maximo,
  MIN(lux)  AS minimo
FROM lecturas
GROUP BY 1;

-- ================================
--  VISTA MATERIALIZADA: POR SEMANA (ISO)
-- ================================

CREATE MATERIALIZED VIEW IF NOT EXISTS lecturas_semana AS
SELECT 
  date_trunc('week', ts) AS periodo,
  AVG(lux)  AS promedio,
  MAX(lux)  AS maximo,
  MIN(lux)  AS minimo
FROM lecturas
GROUP BY 1;

-- ================================
--  VISTA MATERIALIZADA: POR MES
-- ================================

CREATE MATERIALIZED VIEW IF NOT EXISTS lecturas_mes AS
SELECT 
  date_trunc('month', ts) AS periodo,
  AVG(lux)  AS promedio,
  MAX(lux)  AS maximo,
  MIN(lux)  AS minimo
FROM lecturas
GROUP BY 1;
