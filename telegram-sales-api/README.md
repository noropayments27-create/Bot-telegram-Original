# telegram-sales-api

API base para el bot de ventas en Telegram.

## Requisitos
- Node.js 18+
- npm

## Instalacion
```bash
npm install
```

## Variables de entorno
Configura estas variables en `.env`:
- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_TELEGRAM_IDS`
- `BOT_TO_API_SECRET`
- `ADMIN_TOKEN_SECRET` (opcional, si no se usa se reutiliza `ADMIN_PASSWORD`)

## Desarrollo
```bash
npm run dev
```

## Produccion
```bash
npm start
```

## Endpoint de salud
- GET `http://localhost:3001/health`
