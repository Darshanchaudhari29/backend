require('dotenv').config();
const admin = require('firebase-admin');

let db;

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return admin.credential.cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON));
  }

  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: getCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'zepto-7e0b8'
  });
}

db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// Export both db and admin so middleware can call admin.auth()
db.admin = admin;
module.exports = db;
