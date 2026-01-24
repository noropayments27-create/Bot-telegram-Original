const app = require('./app');
const env = require('./config/env');
const { connectDb } = require('./db');
const { startOrderExpiryJob } = require('./services/orderExpiryJob');

// Conectar a la base de datos
connectDb();

// Iniciar jobs / cron internos
startOrderExpiryJob();

// Puerto dinámico (Koyeb lo inyecta)
const PORT = env.PORT || 3001;

// Escuchar en todas las interfaces (OBLIGATORIO EN CLOUD)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API listening on port ${PORT}`);
});
