const express = require('express');
const { userAuth } = require('../middleware/auth');
const { db, orderRef, productRef } = require('../utils/firestore');

const router = express.Router();

router.use(userAuth);

router.get('/', async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id || req.user.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User identity not found' });
    }

    const snapshot = await db.collection('orders')
      .where('user_id', '==', String(userId))
      .orderBy('created_at', 'desc')
      .get();

    const orders = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.data().order_id,
      total_amount: Number(doc.data().total_amount || 0)
    }));

    return res.json({ items: orders });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id || req.user.userId;
    const snapshot = await orderRef(req.params.id).get();

    if (!snapshot.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = snapshot.data();
    if (String(order.user_id) !== String(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const itemsSnapshot = await orderRef(req.params.id).collection('items').get();
    const items = await Promise.all(itemsSnapshot.docs.map(async (itemDoc) => {
      const item = itemDoc.data();
      const productSnapshot = await productRef(item.product_id).get();
      const product = productSnapshot.exists ? productSnapshot.data() : null;
      return {
        ...item,
        product_name: product ? product.name : 'Unknown Product',
        product_image: product ? (product.image_url || (product.image_urls && product.image_urls[0])) : null
      };
    }));

    return res.json({
      order: {
        ...order,
        id: order.order_id,
        total_amount: Number(order.total_amount || 0)
      },
      items
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
