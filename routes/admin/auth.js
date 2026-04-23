const express = require('express');
const { requireAdmin } = require('../../middleware/firebaseAuth');
const { userRef } = require('../../utils/firestore');
const db = require('../../config/db');

const router = express.Router();

/**
 * POST /api/admin/auth/login
 * Accepts a Firebase ID token from frontend (after signInWithEmailAndPassword),
 * verifies admin role in Firestore, and returns user info.
 */
async function loginHandler(req, res) {
  const { idToken } = req.body || {};

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    const admin = db.admin;
    const decoded = await admin.auth().verifyIdToken(idToken);

    const snapshot = await db.collection('users').doc(decoded.uid).get();
    if (!snapshot.exists) {
      return res.status(403).json({ error: 'User record not found' });
    }

    const user = snapshot.data();
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }

    return res.json({
      token: idToken,
      user: {
        id: user.user_id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    return res.status(401).json({ error: 'Invalid Firebase token' });
  }
}

router.post('/login', loginHandler);

router.get('/me', requireAdmin, async (req, res) => {
  const userId = req.user.uid || req.user.sub || req.user.id;
  const snapshot = await userRef(userId).get();
  const user = snapshot.exists ? snapshot.data() : null;
  if (!user) {
    return res.status(404).json({ error: 'Admin not found' });
  }

  return res.json({
    user: {
      id: user.user_id,
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      role: user.role,
      created_at: user.created_at
    }
  });
});

module.exports = router;
