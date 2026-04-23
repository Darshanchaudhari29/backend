const admin = require('../config/db').admin;
const db = require('../config/db');

/**
 * Extracts and verifies a Firebase ID token from the Authorization header.
 * Attaches decoded token to req.firebaseUser.
 */
async function verifyFirebaseToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Requires a valid Firebase token AND role === 'admin' in Firestore users collection.
 */
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing admin token' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;

    // Look up user in Firestore to check role
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) {
      return res.status(403).json({ error: 'User record not found' });
    }

    const userData = userSnap.data();
    if (userData.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = {
      sub: decoded.uid,
      uid: decoded.uid,
      email: decoded.email,
      role: userData.role,
      name: userData.name
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Requires any authenticated Firebase user. Does NOT check role.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;

    const userSnap = await db.collection('users').doc(decoded.uid).get();
    req.user = userSnap.exists
      ? { ...userSnap.data(), uid: decoded.uid, sub: decoded.uid }
      : { uid: decoded.uid, sub: decoded.uid, email: decoded.email, role: 'customer' };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { verifyFirebaseToken, requireAdmin, requireAuth };
