# Documentacion de uso del bot (Admin y Cliente)

Este documento describe como usar el bot de ventas de Telegram desde la perspectiva de clientes y administradores, con base en el comportamiento actual del proyecto.

## Cliente (usuario final)

### 1) Acceso y registro
- El bot exige codigo de acceso para usuarios no admin.
- El codigo se ingresa en el primer contacto con `/start` o usando un link de referido con payload (por ejemplo: `/start CODIGO`).
- Si el usuario ya tiene un codigo asignado, no puede cambiarlo.

### 2) Comandos utiles
- `/start`: inicia el bot y muestra el menu principal.
- `/shop`: abre la tienda.
- `/support` o `/soporte`: abre el flujo de soporte.
- `/cancel`: cancela el flujo actual (por ejemplo soporte).
- `/lang es|en`: cambia idioma.

### 3) Menu principal (botones)
- Tienda, Metodos, Grupos VIP, Programas y Web, Carrito, Afiliados, Comunidad, Soporte, Idioma.

### 4) Navegacion de productos
- Tienda: listado paginado de productos.
- Categorias: Metodos / VIP / Programas y Web.
- Al seleccionar un producto se muestra su descripcion, stock y precio.

### 5) Compra directa
- En la ficha del producto se puede comprar directamente.
- El bot crea la orden y presenta metodos de pago disponibles.
- Tras seleccionar metodo, presionar “Ya pague” y enviar captura.

### 6) Carrito
- Se puede anadir al carrito desde la ficha del producto.
- En Carrito se puede:
  - Ver productos y total.
  - Comprar todo (checkout).
  - Borrar todo el carrito.

### 7) Metodos de pago
- El bot soporta (segun configuracion): Nequi, Binance ID, Cripto, MercadoPago, PayPal.
- Para cripto se elige el activo (BTC, LTC, USDT TRON/BSC) y el bot entrega wallet + monto sugerido.
- Si un metodo esta deshabilitado por la API, el bot lo informa.

### 8) Confirmacion de pago
- Al presionar “Ya pague” el bot solicita la captura.
- Se acepta:
  - Foto normal.
  - Documento que sea imagen.
- El bot confirma la recepcion de la captura.

### 9) Estado del pedido
- Boton “Ver estado” consulta el ultimo pedido en session.

### 10) Soporte
- Menues: “Compra” o “Bug”.
- Se crea un ticket si no hay uno activo.
- Se pueden enviar mensajes de texto.
- En algunos casos el admin habilita 1 imagen por ticket.
- Si el usuario esta baneado, el bot bloquea el soporte.

### 11) Afiliados
- Desde Afiliados se puede:
  - Ver informacion y FAQ.
  - Solicitar registro.
  - Ver panel si esta aprobado.
- Metodos de cobro: USDT BSC, Nequi o Binance ID.
- En el panel se ven estadisticas, top ventas y retiros (minimo o total).

### 12) Idiomas
- Se puede cambiar desde el boton “Idioma” o con `/lang es|en`.

---

## Admin

### 1) Requisitos
- El Telegram ID del admin debe estar en `ADMIN_TELEGRAM_IDS`.
- Debe estar configurado `BOT_TO_API_SECRET` para acciones sensibles.

### 2) Autenticacion del panel admin via Telegram
- El admin inicia sesion en el panel web con usuario/clave.
- La API envia solicitud al admin via Telegram.
- El admin aprueba o rechaza desde el bot.
- Si aprueba, el panel recibe token y habilita acceso.

### 3) Acciones admin desde Telegram
- Aprobar/denegar login del panel (acciones de “admin_auth”).
- Banear usuarios (acciones de “admin_ban”).
- Estas acciones llegan en botones dentro de mensajes generados por la API.

### 4) Panel web admin (resumen)
- Dashboard: metricas y accesos rapidos.
- Ordenes: ver detalles, estados, comprobantes.
- Inventario: crear/editar productos, stock simple/units, CSV de unidades, holds.
- Tickets: responder mensajes y ver adjuntos.
- Broadcasts: difusiones por segmento.
- Payouts: gestionar pagos a afiliados y recibos.
- Afiliados: aprobar/rechazar, ajustes, facturas, fotos.

