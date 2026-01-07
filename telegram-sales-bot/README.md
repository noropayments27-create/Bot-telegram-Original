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
- `BOT_RATE_LIMIT_ENABLED`
- `BOT_RATE_LIMIT_SECONDS`
- `ADMIN_TELEGRAM_IDS`
- `BOT_TO_API_SECRET`

## Ejecucion
```bash
python -m src.main
```
