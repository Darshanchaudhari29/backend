const db = require('./db');

/**
 * Ensures Firestore has the required _meta/schema document.
 * Called at server startup.
 */
async function ensureAdminSchema() {
  try {
    const ref = db.collection('_meta').doc('schema');
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({
        version: '2026-04-17',
        applied_at: new Date().toISOString(),
        note: 'Run: node scripts/bootstrap-firestore.js to seed full schema + data'
      });
      console.log('✅ _meta/schema created (stub). Run bootstrap script for full seed.');
    }

    return true;
  } catch (error) {
    // Non-fatal: schema check failure shouldn't crash the server
    console.warn('⚠️  Schema check failed (non-fatal):', error.message);
    return false;
  }
}

module.exports = {
  ensureAdminSchema
};
