const express = require('express');
const { authRequired } = require('../../middleware/auth');
const { toNumber } = require('../../utils/format');
const { attachCategoryAndImages, listProducts, loadCategoriesMap, productRef } = require('../../utils/firestore');

const router = express.Router();

router.use(authRequired);

router.get('/', async (req, res) => {
  const items = (await listProducts()).map((item) => ({
    ...item,
    lowStock: item.stock_quantity < 10
  }));

  return res.json({ items });
});

router.patch('/products/:id/stock', async (req, res) => {
  const productId = req.params.id;
  const snapshot = await productRef(productId).get();

  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const existing = snapshot.data();
  let nextStock = toNumber(existing.stock_quantity, 0);
  if (req.body.stock != null && req.body.stock !== '') {
    nextStock = toNumber(req.body.stock, nextStock);
  } else if (req.body.delta != null && req.body.delta !== '') {
    nextStock += toNumber(req.body.delta, 0);
  } else {
    return res.status(400).json({ error: 'Stock or delta is required' });
  }

  nextStock = Math.max(0, nextStock);

  await productRef(productId).set(
    {
      stock_quantity: nextStock,
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );

  const updated = await productRef(productId).get();
  const categoriesMap = await loadCategoriesMap();
  return res.json({ item: await attachCategoryAndImages(updated, categoriesMap) });
});

module.exports = router;
