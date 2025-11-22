# Mapeo Solar

## Requisitos
- Node 18+
- PostgreSQL 14+
 
 para node es este link  https://nodejs.org/es/download
 y yo tengo postgres de manera local pero lo podemos checar okey

## Base de datos
```bash
createdb mapeo_solar
psql mapeo_solar -f db/schema.sql
psql mapeo_solar -f db/views.sql
```
esto si tienen cmd si no pues copian y pegan 

## Servidor
```bash
cd server
cp .env.example .env   # este se esita ahuevo como .env pero en un futuro lo hacemos
npm i
npm start
```

## Frontend
```bash
cd frontend
npm i
npm run dev
```
y buscan el `http://localhost:5173` ah jajajs y el servidor se abre en el 3000 `http://localhost:3000`


