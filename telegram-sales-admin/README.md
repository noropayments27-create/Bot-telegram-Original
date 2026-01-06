# telegram-sales-admin

Panel web para administracion del bot de ventas.

## Requisitos
- Node.js 18+
- npm

## Instalacion
```bash
npm install
```

## Variables de entorno
Crea `.env.local` basado en `.env.local.example`.

## Desarrollo
```bash
npm run dev
```

## Produccion
```bash
npm run build
npm start
```

## Deploy en Netlify (resumen)
- Build command: `npm run build`
- Publish directory: `.next`
- Variables: `NEXT_PUBLIC_API_BASE_URL`
