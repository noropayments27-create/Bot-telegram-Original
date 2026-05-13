# telegram-sales-bot

Bot de Telegram para ventas usando aiogram (v3).

## Requisitos
- Python 3.10+

## Instalacion
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Variables de entorno
Configura estas variables en `.env`:
- `TELEGRAM_BOT_TOKEN`
- `API_BASE_URL`
- `API_TOKEN` (opcional)
- `BOT_UPDATE_MODE` (`polling` por defecto, `webhook` en produccion)
- `WEBHOOK_URL` (URL publica HTTPS completa cuando `BOT_UPDATE_MODE=webhook`)
- `WEBHOOK_PATH` (ruta local del webhook, por defecto `/telegram/webhook`)
- `WEBHOOK_HOST` (por defecto `0.0.0.0`)
- `WEBHOOK_PORT` (por defecto `8080`)
- `WEBHOOK_SECRET` (token secreto para validar llamadas de Telegram)
- `BOT_RATE_LIMIT_ENABLED`
- `BOT_RATE_LIMIT_SECONDS`
- `ADMIN_TELEGRAM_IDS`
- `BOT_TO_API_SECRET`

## Ejecucion
```bash
python -m src.main
```

## Webhook de Telegram
Para produccion puedes evitar polling y recibir actualizaciones por webhook:

```bash
BOT_UPDATE_MODE=webhook
WEBHOOK_URL=https://tu-dominio.com/telegram/webhook
WEBHOOK_PATH=/telegram/webhook
WEBHOOK_PORT=8080
WEBHOOK_SECRET=un-secreto-largo
python -m src.main
```

El proxy publico debe enviar `WEBHOOK_URL` hacia `WEBHOOK_HOST:WEBHOOK_PORT` y la misma ruta `WEBHOOK_PATH`.
