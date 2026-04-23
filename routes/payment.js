const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { db, orderRef } = require('../utils/firestore');

const router = express.Router();

let razorpayInstance = null;
const getRazorpay = () => {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || 'MISSING',
      key_secret: process.env.RAZORPAY_KEY_SECRET || 'MISSING',
    });
  }
  return razorpayInstance;
};


/**
 * POST /api/payment/verify
 * Verifies Razorpay signature and updates order status.
 */
router.post('/verify', async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature,
    orderId // Our internal Firestore order ID
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
    return res.status(400).json({ error: 'Missing required fields for verification' });
  }

  try {
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature === razorpay_signature) {
      // Payment verified! Update Firestore order
      await db.collection('orders').doc(orderId).set({
        order_status: 'placed', // Move from 'pending_payment' to 'placed'
        payment_status: 'success',
        razorpay_payment_id,
        updated_at: new Date().toISOString()
      }, { merge: true });

      return res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      return res.status(400).json({ error: 'Invalid signature. Payment verification failed.' });
    }
  } catch (error) {
    console.error('Payment Verification Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
