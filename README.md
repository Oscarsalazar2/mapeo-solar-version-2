# Mapeo Solar

## Requisitos

- Node.js 18+
- PostgreSQL 14+

Descarga Node.js: https://nodejs.org/es/download

## Base de datos

```bash
createdb mapeo_solar
psql mapeo_solar -f db/schema.sql
psql mapeo_solar -f db/views.sql
```

## Servidor

```bash
cd server
copy .env.example .env
npm i
npm start
```

Variables en `server/.env`:

- `DATABASE_URL`: conexión a PostgreSQL
- `PORT`: puerto del backend (por defecto `3000`)
- `CORS_ORIGIN`: origen permitido del frontend (por defecto `http://localhost:5173`)
- `DEMO_MODE`: `true` o `false`

## Frontend

```bash
cd frontend
copy .env.example .env
npm i
npm run dev
```

Variables en `frontend/.env`:

- `VITE_API_BASE_URL`: URL base del backend (por defecto `http://localhost:3000`)

## URLs locales

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
