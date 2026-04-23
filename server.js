require('dotenv').config();

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { ensureAdminSchema } = require('./config/schema');
const { validateEnv } = require('./config/env');

validateEnv();

const adminAuthRoutes = require('./routes/admin/auth');
const adminCategoriesRoutes = require('./routes/admin/categories');
const adminDashboardRoutes = require('./routes/admin/dashboard');
const adminInventoryRoutes = require('./routes/admin/inventory');
const adminOrdersRoutes = require('./routes/admin/orders');
const adminProductsRoutes = require('./routes/admin/products');
const customerAuthRoutes = require('./routes/customer-auth');
const customerOrdersRoutes = require('./routes/customer-orders');
const publicRoutes = require('./routes/public');
const paymentRoutes = require('./routes/payment');


const app = express();
const port = process.env.PORT || 5000;

// ─── Global error guards ─────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Fatal — shutting down in 1s...', err);
  // Give in-flight requests 1s to finish, then exit so process manager can restart
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  // Log but don't crash — these are often recoverable
});

// ─── Middleware ────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) 
  : true;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

app.use(helmet());
app.use(compression());

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests, please try again later.' }
});

// Apply to all routes
app.use('/api/', limiter);

app.use(express.json({ limit: '5mb' }));

// ─── Health ────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await require('./config/db').collection('_meta').doc('schema').get();
    res.json({ ok: true, service: 'backend', time: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Firestore unavailable' });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', customerAuthRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/products', adminProductsRoutes);
app.use('/api/admin/categories', adminCategoriesRoutes);
app.use('/api/admin/inventory', adminInventoryRoutes);
app.use('/api/admin/orders', adminOrdersRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/orders', customerOrdersRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api', publicRoutes);


// ─── Fallbacks ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  console.error('[express error]', error);
  res.status(500).json({ error: error.message || 'Server error' });
});

// ─── Boot ──────────────────────────────────────────────────────────────────
async function start() {
  await ensureAdminSchema();

  const server = app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
  });

  // Catch EADDRINUSE and other listen errors explicitly
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Kill the other process first:`);
      console.error(`   Run: netstat -ano | findstr :${port}  then: taskkill /PID <PID> /F`);
    } else {
      console.error('❌ Server error:', err);
    }
    process.exit(1);
  });
}

start().catch((error) => {
  console.error('❌ Server boot failed:', error);
  process.exit(1);
});
