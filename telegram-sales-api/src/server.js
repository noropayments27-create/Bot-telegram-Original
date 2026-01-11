const app = require('./app');
const env = require('./config/env');
const { connectDb } = require('./db');
const { startOrderExpiryJob } = require('./services/orderExpiryJob');

connectDb();
startOrderExpiryJob();

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
