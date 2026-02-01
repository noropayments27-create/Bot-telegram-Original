# Manual de uso del bot (paso a paso)

Este manual explica como usar el bot como cliente y como admin con pasos practicos.

## Cliente (paso a paso)

### A. Primer ingreso
1) Escribe `/start` en el bot.
2) Si no eres admin, el bot pedira un codigo de acceso.
3) Envia el codigo que te compartieron.
4) Si es valido, veras el menu principal.

### B. Comprar un producto (compra directa)
1) En el menu, toca “Tienda”.
2) Selecciona el producto en el listado.
3) Revisa descripcion, stock y precio.
4) Toca “Comprar”.
5) Elige metodo de pago.
6) Realiza el pago y luego toca “Ya pague”.
7) Envia una captura del comprobante.
8) El bot confirma que recibio tu captura.

### C. Comprar usando carrito
1) Entra a “Tienda” o “Categorias”.
2) En la ficha de un producto toca “Anadir al carrito”.
3) Repite para otros productos.
4) En el menu principal, entra a “Carrito”.
5) Verifica tu lista y total.
6) Toca “Comprar todo” para crear la orden.
7) Elige metodo de pago, paga y envia captura.

### D. Ver estado de pedido
1) Usa el boton “Ver estado”.
2) El bot consultara el ultimo pedido en session.

### E. Soporte
1) En el menu principal toca “Soporte”.
2) Elige el tipo de solicitud (Compra o Bug).
3) Escribe tu mensaje.
4) Si el admin habilita imagen, podras enviar 1 captura.

### F. Afiliados
1) En el menu principal toca “Afiliados”.
2) Si no estas registrado, elige “Quiero ser afiliado”.
3) Selecciona metodo de cobro (USDT BSC, Nequi o Binance ID).
4) Envia el dato solicitado.
5) Espera aprobacion del admin.
6) Al ser aprobado, podras ver panel y solicitar retiros.

### G. Idioma
1) En el menu principal toca “Idioma”.
2) Elige Espanol o Ingles.
3) Tambien puedes usar `/lang es` o `/lang en`.

---

## Admin (paso a paso)

### A. Acceso al panel web
1) Entra al panel web.
2) Escribe usuario y contrasena.
3) La API enviara una solicitud al admin por Telegram.
4) Abre el bot y aprueba la solicitud.
5) El panel recibira el token y te dejara entrar.

### B. Aprobar o rechazar accesos
1) En Telegram, recibirás botones de “aprobar” o “denegar”.
2) Presiona la opcion adecuada.
3) El panel se habilitara o rechazara automaticamente.

### C. Banear un usuario
1) En Telegram, el bot mostrara botones de baneo cuando corresponda.
2) Presiona el boton “Banear”.
3) El usuario quedara bloqueado segun la API.

### D. Operacion diaria en panel
1) Dashboard: revisa ventas, ordenes y tickets nuevos.
2) Ordenes: revisa pagos, estados y comprobantes.
3) Inventario: crea o edita productos, stock y unidades.
4) Tickets: responde a usuarios y adjunta imagen si aplica.
5) Broadcasts: crea campañas segmentadas.
6) Payouts: gestiona pagos a afiliados y recibos.
7) Afiliados: aprueba solicitudes, ajusta saldos y revisa facturas.

