# Bot Shop Telegram Pro

Este README describe la version Pro actual del proyecto. La version Pro es un sistema completo de ventas automatizadas en Telegram con bot, API, panel web, base de datos, inventario, pagos, entregas, afiliados, wallets, soporte, broadcasts, backups y herramientas administrativas.

## Arquitectura

El proyecto esta dividido en tres partes:

- `telegram-sales-bot`: bot de Telegram en Python con aiogram v3.
- `telegram-sales-api`: API en Node.js/Express conectada a PostgreSQL.
- `telegram-sales-admin`: panel web en Next.js para administracion.

Componentes externos usados por la version Pro:

- Telegram Bot API para mensajes, archivos, botones y notificaciones.
- PostgreSQL para usuarios, productos, ordenes, pagos, stock, afiliados, tickets, broadcasts y auditoria.
- Playwright para renderizar recibos en imagen.
- Tesseract.js para validacion OCR configurable de comprobantes.
- Servicios de tasas para conversion fiat/cripto.
- Google Drive y Telegram como destinos opcionales de backups.
- SMTP para recuperacion de cuenta admin por email.

## Bot De Telegram

El bot atiende clientes, afiliados y administradores desde Telegram.

Funciones para clientes:

- Inicio con `/start`.
- Acceso por codigo para usuarios no administradores.
- Soporte de deeplinks y codigos de referido.
- Menu principal configurable.
- Catalogo paginado.
- Categorias como Tienda, Metodos, Grupos VIP, Programas y Web.
- Ficha de producto con descripcion, precio, stock y acciones.
- Compra directa.
- Carrito de compras.
- Checkout de carrito.
- Seleccion de metodo de pago.
- Flujo de "Ya pague" con envio de captura.
- Recepcion de comprobantes como foto o documento de imagen.
- Consulta de estado de pedido.
- Soporte por tickets.
- Solicitud de afiliacion.
- Panel de afiliado.
- Wallet de usuario.
- Recarga de wallet.
- Historial de wallet.
- Pago de orden con wallet cuando hay saldo disponible.
- Cambio de idioma entre Espanol e Ingles.

Comandos principales para usuario:

- `/start`
- `/shop`
- `/support`
- `/soporte`
- `/cancel`
- `/lang es`
- `/lang en`

Protecciones del bot:

- Middleware de modo mantenimiento.
- Middleware de usuarios baneados.
- Middleware de codigo de acceso.
- Middleware para chats privados.
- Rate limit configurable.
- Registro/reportes de errores del bot hacia la API.

## Pagos

La version Pro soporta multiples metodos de pago configurables:

- Nequi.
- Binance ID.
- Cripto.
- BTC.
- LTC.
- USDT TRON.
- USDT BSC.
- Mercado Pago.
- PayPal.
- Wallet interna.

Funciones de pagos:

- Metodos activables/desactivables desde panel.
- Etiquetas, descripciones, destinos e imagenes por metodo.
- Markup por metodo de pago.
- Conversion de USD a moneda local o cripto.
- Instrucciones de pago por metodo.
- Recepcion de comprobante.
- Validacion OCR configurable del comprobante.
- Revision del pago por admin.
- Aprobacion.
- Rechazo con reintento.
- Reembolso.
- Marcado como estafa.
- Notificacion de orden al admin por Telegram.

## Inventario Y Productos

La version Pro permite manejar productos digitales con inventario simple o por unidades.

Funciones:

- Crear productos.
- Editar nombre, descripcion, precio, categoria e imagen.
- Activar/desactivar productos.
- Marcar producto como agotado.
- Producto gratis.
- Compra unica por usuario.
- Codigo permanente de producto.
- Categorias por seccion.
- Stock SIMPLE.
- Stock UNITS.
- Stock ilimitado.
- Stock numerico.
- Holds de stock durante el pago.
- Liberacion automatica de stock si la orden expira.
- Inspeccion de stock desde el panel.
- Agregar y eliminar unidades.
- Recalculo de stock.

Tipos de entrega soportados:

- Texto.
- Link.
- Link con expiracion.
- Imagen.
- Video.
- Archivo.
- Unidades con plantilla.

La entrega puede usar payloads en Espanol e Ingles y plantillas para unidades con campos como usuario, password, fecha de inicio, expiracion, notas y comprador.

## Ordenes

La API administra el ciclo completo de una orden:

- Crear orden.
- Crear orden desde carrito.
- Reservar stock.
- Mostrar metodos de pago.
- Recibir comprobante.
- Pagar con wallet.
- Aprobar pago.
- Rechazar pago.
- Reintentar comprobante.
- Reembolsar.
- Marcar como estafa.
- Expirar ordenes sin pago.
- Liberar stock reservado.
- Entregar productos al aprobar.
- Generar recibo.
- Consultar detalle e historial desde panel.

El sistema maneja numeros visibles de orden, ordenes de prueba, ordenes gratis y estados como esperando pago, pagada, entregada, cancelada, reembolsada, expirada y estafa.

## Entrega Automatica

Al aprobar una orden, la API entrega el producto por Telegram.

La entrega soporta:

- Mensajes de texto.
- Links.
- Links con expiracion.
- Fotos.
- Videos.
- Documentos.
- Multiples mensajes.
- Cantidad comprada.
- Unidades individuales.
- Plantillas HTML seguras para datos sensibles.
- Delay inicial y delay entre mensajes configurables.

## Wallet Interna

La version Pro incluye wallet de usuario.

Funciones:

- Ver saldo.
- Ver historial.
- Crear recarga.
- Elegir metodo de pago para recarga.
- Enviar comprobante de recarga.
- Aprobar recarga desde panel o Telegram.
- Rechazar recarga.
- Marcar recarga como estafa.
- Ajustar saldo de usuarios desde panel.
- Pagar ordenes con saldo de wallet.
- Regalos de saldo mediante botones en broadcasts o publicaciones.
- Listado de regalos y reclamos.

## Afiliados

El sistema de afiliados permite escalar ventas con referidos y comisiones.

Funciones para afiliados:

- Solicitar afiliacion desde el bot.
- Elegir metodo de cobro: USDT BSC, Nequi o Binance ID.
- Actualizar destino de cobro.
- Ver panel de afiliado.
- Ver estadisticas.
- Ver top de ventas.
- Solicitar retiro minimo o total.
- Consultar informacion, reglas, comisiones, niveles y FAQ.

Funciones para admin:

- Aprobar/rechazar afiliados.
- Bloquear/desbloquear afiliados.
- Editar datos de afiliado.
- Eliminar afiliado.
- Ver detalle de afiliado.
- Crear ajustes manuales.
- Crear facturas internas.
- Gestionar comisiones.
- Configurar boost global de comision.
- Gestionar payouts/retiros.
- Marcar payout como enviado.
- Cancelar payout.
- Generar/ver recibos de retiro.

## Soporte

La version Pro incluye soporte por tickets.

Funciones:

- Crear ticket desde el bot.
- Tipos de solicitud: compra o bug.
- Mensajes de texto entre usuario y admin.
- Adjuntar imagen cuando el admin lo permite.
- Ver tickets desde panel.
- Responder desde panel.
- Cerrar tickets.
- Banear usuario desde ticket.
- Consultar imagenes adjuntas.
- Bloqueo de soporte para usuarios baneados.

## Broadcasts Y Publicaciones

La version Pro permite enviar comunicaciones masivas y publicaciones.

Broadcasts:

- Crear broadcast desde panel o bot admin.
- Guardar broadcasts.
- Editar texto.
- Agregar botones.
- Agregar multimedia.
- Enviar a todos los usuarios.
- Enviar a compradores.
- Enviar a afiliados.
- Enviar a compradores y afiliados.
- Excluir destinatarios.
- Ver progreso.
- Pausar.
- Reanudar.
- Detener.
- Eliminar.
- Crear broadcasts con regalos de saldo.

Publicaciones a canales y grupos:

- Registrar grupos y canales donde el bot participa.
- Enviar publicaciones a grupos.
- Enviar publicaciones a canales.
- Enviar a todos los destinos.
- Usar texto, imagen/video/animacion y botones.
- Guardar publicaciones.
- Crear publicaciones con regalos de saldo.

## Panel Admin Web

El panel web incluye:

- Login.
- Autenticacion con aprobacion por Telegram.
- Login directo configurable.
- Recuperacion de contrasena por email.
- Perfil de recuperacion.
- Dashboard.
- Ordenes.
- Detalle de orden.
- Inventario.
- Metodos de pago.
- Imagenes/assets del bot.
- Editor de home/menu.
- Afiliados.
- Payouts.
- Wallets.
- Tickets.
- Broadcasts.
- Backups y restauracion.
- Modo mantenimiento.
- Estadisticas y exportaciones.

Paginas principales:

- `/dashboard`
- `/orders`
- `/orders/[id]`
- `/inventory`
- `/payment-methods`
- `/images`
- `/home-menu`
- `/affiliates`
- `/payouts`
- `/payouts/[id]`
- `/wallets`
- `/tickets`
- `/tickets/[id]`
- `/broadcasts`
- `/broadcasts/[id]`
- `/broadcasts/new`
- `/recovery-profile`
- `/telegram-login`
- `/telegram-access`

## Admin Desde Telegram

Los administradores tambien pueden operar desde Telegram.

Funciones:

- Panel admin con `/admin`.
- Estado con `/astatus` o `.info`.
- Ver ordenes pendientes con `/orders pending [n]`.
- Ver detalle de orden con `/order <order_id>`.
- Aprobar orden con `/approve <order_id>`.
- Rechazar orden con `/reject <order_id> <motivo>`.
- Reembolsar con `/refund <order_id> <motivo>`.
- Banear con `/ban <telegram_id> <motivo>`.
- Desbanear con `/unban <telegram_id>`.
- Activar/desactivar mantenimiento con `/maint on|off`.
- Enviar difusion rapida con `/broadcast <mensaje>`.
- Detener difusion con `/Parardifusion <id>`.
- Ver logs con `/logs [api|bot|admin|errors|payments|support] [n]`.

El panel admin de Telegram tambien incluye accesos para ordenes, wallets, file ID, baneos, mantenimiento, difusiones, publicaciones a canales/grupos, productos, configuracion del home, logs, estado, top vendidos, ganancias y login.

## Seguridad Y Control

Funciones de seguridad:

- Lista de administradores por Telegram ID.
- Secreto bot-a-API (`BOT_TO_API_SECRET`).
- API key admin opcional.
- Rate limit admin.
- Login admin con aprobacion por Telegram.
- Recuperacion por email.
- Auditoria admin.
- Logs de acciones.
- Baneos de usuarios.
- Baneos de soporte.
- Modo mantenimiento.
- Validaciones de comprobantes.
- Prevencion de sobreventa mediante holds.
- Expiracion de ordenes sin pago.
- Proteccion de rutas admin.
- CORS configurable.
- Helmet en API.

## Backups Y Operacion

La version Pro incluye herramientas operativas:

- Backup de PostgreSQL por script.
- Restore de PostgreSQL por script.
- Backup diario via cron.
- Backup manual desde panel.
- Restauracion desde panel.
- Descarga del ultimo backup.
- Upload opcional a Google Drive.
- Upload opcional a Telegram.
- Healthcheck de API.
- Logs y reporte de errores de admin/bot/API.

## Estadisticas Y Reportes

El panel y la API incluyen:

- Resumen de ventas.
- Conteo de ordenes por estado.
- Top de productos del mes.
- Insights de ventas.
- Export CSV.
- Export XLSX.
- Ganancias por periodos desde comandos admin.
- Top vendidos desde comandos admin.
- Contadores de payouts.
- Conteos de usuarios.

## Variables De Entorno Principales

API:

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_TELEGRAM_IDS`
- `BOT_TO_API_SECRET`
- `APP_URL`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_API_KEY`
- `ADMIN_TOKEN_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `BACKUP_DRIVE_ENABLED`
- `BACKUP_DRIVE_FOLDER_ID`
- `BACKUP_TELEGRAM_ENABLED`
- `BACKUP_TELEGRAM_CHAT_IDS`

Bot:

- `TELEGRAM_BOT_TOKEN`
- `API_BASE_URL`
- `API_TOKEN`
- `BOT_TO_API_SECRET`
- `ADMIN_TELEGRAM_IDS`
- `BOT_USERNAME`
- `ADMIN_API_KEY`
- `ADMIN_PANEL_LOCAL_URL`

Admin:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_BOT_USERNAME`
- `NEXT_PUBLIC_LOGIN_BG_URL`
- `NEXT_PUBLIC_FAVICON_VERSION`

## Ejecucion Local

API:

```bash
cd telegram-sales-api
npm install
npm run dev
```

Bot:

```bash
cd telegram-sales-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.main
```

Admin:

```bash
cd telegram-sales-admin
npm install
npm run dev
```

Build del panel admin:

```bash
cd telegram-sales-admin
npm run build
npm start
```

## Resumen Comercial

Bot Shop Telegram Pro convierte Telegram en una plataforma de ventas profesional. Automatiza el flujo desde la entrada del cliente hasta la entrega del producto, con control administrativo, inventario, pagos, afiliados, soporte, difusiones, wallet, backups y herramientas de seguridad.

Es la version recomendada para negocios digitales que necesitan operar 24/7, escalar ventas, controlar inventario, manejar afiliados y mantener trazabilidad de pedidos, pagos y soporte.

