const express = require('express');
const { requireAuth } = require('../middleware/firebaseAuth');
const { makeId, nowIso, userRef, addressRef } = require('../utils/firestore');
const db = require('../config/db');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Called AFTER Firebase Auth user is already created on the frontend.
 * Creates the Firestore user document with the Firebase UID as doc ID.
 * Body: { uid, name, email, phone }
 */
router.post('/signup', async (req, res) => {
  const { uid, name, email, phone, idToken } = req.body || {};

  if (!uid || !name || !email || !idToken) {
    return res.status(400).json({ error: 'uid, name, email and idToken are required' });
  }

  // Verify the idToken to confirm this request is legit
  try {
    const admin = db.admin;
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.uid !== uid) {
      return res.status(403).json({ error: 'Token UID mismatch' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid Firebase token' });
  }

  // Check if user doc already exists
  const existing = await db.collection('users').doc(uid).get();
  if (existing.exists) {
    const data = existing.data();
    return res.json({
      user: {
        id: data.user_id,
        user_id: data.user_id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        role: data.role,
        created_at: data.created_at
      }
    });
  }

  // Check email uniqueness
  const emailSnap = await db.collection('users').where('email', '==', String(email).toLowerCase()).limit(1).get();
  if (!emailSnap.empty && emailSnap.docs[0].id !== uid) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const now = nowIso();
  const userData = {
    user_id: uid,
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    phone: phone ? String(phone).trim() : null,
    password_hash: null, // Firebase handles password
    role: 'customer',
    created_at: now,
    updated_at: now
  };

  await db.collection('users').doc(uid).set(userData);

  return res.status(201).json({
    user: {
      id: userData.user_id,
      user_id: userData.user_id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      role: userData.role,
      created_at: userData.created_at
    }
  });
});

/**
 * POST /api/auth/login
 * Accepts Firebase ID token, returns user profile from Firestore.
 */
router.post('/login', async (req, res) => {
  const { idToken } = req.body || {};

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    const admin = db.admin;
    const decoded = await admin.auth().verifyIdToken(idToken);

    const snap = await db.collection('users').doc(decoded.uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'User profile not found. Please sign up.' });
    }

    const user = snap.data();
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
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

/**
 * GET /api/auth/me
 * Returns current user profile. Requires auth.
 */
router.get('/me', requireAuth, async (req, res) => {
  const snap = await db.collection('users').doc(req.firebaseUser.uid).get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = snap.data();
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

/**
 * PUT /api/auth/profile
 * Update user profile fields.
 */
router.put('/profile', requireAuth, async (req, res) => {
  const { name, phone } = req.body || {};
  const uid = req.firebaseUser.uid;

  const updates = { updated_at: nowIso() };
  if (name) updates.name = String(name).trim();
  if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;

  await db.collection('users').doc(uid).set(updates, { merge: true });

  const snap = await db.collection('users').doc(uid).get();
  const user = snap.data();
  return res.json({
    user: {
      id: user.user_id,
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      role: user.role
    }
  });
});

/**
 * GET/PUT /api/auth/address
 * Get or upsert user address.
 */
router.get('/address', requireAuth, async (req, res) => {
  const snap = await addressRef(req.firebaseUser.uid).get();
  return res.json({ address: snap.exists ? snap.data() : null });
});

router.put('/address', requireAuth, async (req, res) => {
  const uid = req.firebaseUser.uid;
  const { building, street, village_city, state, pincode } = req.body || {};

  if (!building || !street || !village_city || !state || !pincode) {
    return res.status(400).json({ error: 'building, street, village_city, state, and pincode are required' });
  }

  const address = {
    address_id: 'default',
    user_id: uid,
    building: String(building).trim(),
    street: String(street).trim(),
    village_city: String(village_city).trim(),
    state: String(state).trim(),
    pincode: String(pincode).trim(),
    country: 'India',
    updated_at: nowIso()
  };

  await addressRef(uid).set(address, { merge: true });
  return res.json({ address });
});

module.exports = router;
