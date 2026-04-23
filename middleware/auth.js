const { requireAdmin } = require('./firebaseAuth');

/**
 * authRequired — consolidated to Firebase only.
 * Used on all existing admin routes.
 */
async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing admin token' });
  }

  // Delegate entirely to Firebase middleware
  return requireAdmin(req, res, next);
}

/**
 * userAuth — consolidated to Firebase only.
 */
async function userAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const adminSdk = require('../config/db').admin;
  try {
    const decoded = await adminSdk.auth().verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch (error) {
    console.error('Firebase User Auth Error:', error.message);
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

module.exports = {
  authRequired,
  userAuth
};
