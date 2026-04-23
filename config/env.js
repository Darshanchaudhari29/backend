const requiredEnv = [
  'FIREBASE_PROJECT_ID',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET'
];

function validateEnv() {
  const missing = requiredEnv.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Critical environment variables missing:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease set them in your .env file or environment.');
    
    // In production, we should probably exit
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('\n⚠️  Continuing in development mode, but some features may fail.');
    }
  }

  // Also check for Firebase credentials
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && 
      !process.env.GOOGLE_APPLICATION_CREDENTIALS && 
      !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    console.warn('⚠️  No Firebase service account key provided. Falling back to application default credentials.');
  }
}

module.exports = { validateEnv };
