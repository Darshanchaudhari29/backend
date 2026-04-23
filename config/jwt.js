module.exports = {
  secret: process.env.JWT_SECRET || (() => { console.warn('⚠️  JWT_SECRET not set — using insecure fallback. Set JWT_SECRET in .env for production!'); return 'INSECURE_DEV_ONLY_' + require('crypto').randomBytes(32).toString('hex'); })(),
  expiresIn: process.env.JWT_EXPIRES_IN || '7d'
};
