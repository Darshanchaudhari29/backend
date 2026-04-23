const express = require('express');
const { authRequired } = require('../../middleware/auth');
const { toNumber } = require('../../utils/format');
const { db, orderRef, userRef, productRef } = require('../../utils/firestore');

const router = express.Router();

async function mapOrderDoc(doc) {
  const data = doc.data();
  const itemsSnapshot = await doc.ref.collection('items').get();
  return {
    ...data,
    id: data.order_id,
    item_count: itemsSnapshot.size,
    total_amount: Number(data.total_amount || 0)
  };
}

router.use(authRequired);

router.get('/', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const safePage = Math.max(toNumber(page, 1), 1);
  const safeLimit = Math.max(toNumber(limit, 20), 1);
  const offset = (safePage - 1) * safeLimit;

  // Optimized: Use pagination at Firestore level and count total
  const [snapshot, totalSnapshot] = await Promise.all([
    db.collection('orders').orderBy('created_at', 'desc').limit(safeLimit).offset(offset).get(),
    db.collection('orders').count().get()
  ]);

  // Optimized: Parallel item counting for the current page
  const items = await Promise.all(snapshot.docs.map(mapOrderDoc));

  return res.json({
    items,
    total: totalSnapshot.data().count,
    page: safePage,
    limit: safeLimit
  });
});

router.get('/:id', async (req, res) => {
  const snapshot = await orderRef(req.params.id).get();
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = snapshot.data();
  const itemsSnapshot = await orderRef(req.params.id).collection('items').get();
  
  // Optimized: Parallelize product fetching for order items
  const items = await Promise.all(itemsSnapshot.docs.map(async (itemDoc) => {
    const item = itemDoc.data();
    const productSnapshot = await productRef(item.product_id).get();
    const product = productSnapshot.exists ? productSnapshot.data() : null;
    return {
      ...item,
      price: Number(item.price_at_purchase || 0),
      product_name: product ? product.name : null,
      product_image: null,
      product_stock: product ? Number(product.stock_quantity || 0) : 0
    };
  }));

  let user = null;
  if (order.user_id) {
    const userSnapshot = await userRef(order.user_id).get();
    if (userSnapshot.exists) {
      const userData = userSnapshot.data();
      user = {
        id: userData.user_id,
        name: userData.name,
        email: userData.email,
        phone: userData.phone
      };
    }
  }

  return res.json({
    order: {
      ...order,
      id: order.order_id,
      total_amount: Number(order.total_amount || 0)
    },
    user,
    items
  });
});

router.patch('/:id/status', async (req, res) => {
  const VALID_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled'];
  const { status } = req.body || {};

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const snapshot = await orderRef(req.params.id).get();
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Order not found' });
  }

  await orderRef(req.params.id).set(
    { order_status: status, updated_at: new Date().toISOString() },
    { merge: true }
  );

  const updated = await orderRef(req.params.id).get();
  return res.json({ order: { ...updated.data(), id: updated.data().order_id } });
});

module.exports = router;
