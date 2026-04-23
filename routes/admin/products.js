const express = require('express');
const { authRequired } = require('../../middleware/auth');
const { parseBoolean, toNumber } = require('../../utils/format');
const {
  attachCategoryAndImages,
  listProducts,
  loadCategoriesMap,
  normalizeProductPayload,
  productRef,
  db
} = require('../../utils/firestore');

const router = express.Router();

router.use(authRequired);

router.get('/', async (req, res) => {
  const { search, categoryId, isActive, lowStock, page = 1, limit = 20 } = req.query;
  const safePage = Math.max(toNumber(page, 1), 1);
  const safeLimit = Math.max(toNumber(limit, 20), 1);
  const offset = (safePage - 1) * safeLimit;

  try {
    const categoriesMap = await loadCategoriesMap();
    let query = db.collection('products');

    // Apply basic filters at database level
    if (categoryId) {
      query = query.where('category_id', '==', String(categoryId));
    }
    if (isActive != null && isActive !== '') {
      query = query.where('is_active', '==', parseBoolean(isActive, true));
    }
    if (lowStock != null && lowStock !== '') {
      query = query.where('stock_quantity', '<', 10);
    }

    // For simple listing without search, use optimized query
    if (!search) {
      const snapshot = await query.limit(safeLimit + offset).get();
      const docs = snapshot.docs.slice(offset);
      const items = await Promise.all(docs.map(doc => attachCategoryAndImages(doc, categoriesMap)));

      return res.json({
        items,
        total: items.length + offset, // Approximate
        page: safePage,
        limit: safeLimit
      });
    }

    // Full fetch for search (Firestore limitation)
    let items = await listProducts();

    const term = String(search).toLowerCase();
    items = items.filter((item) =>
      [item.name, item.description, item.category].join(' ').toLowerCase().includes(term)
    );

    if (categoryId) {
      items = items.filter((item) => item.category_id === String(categoryId));
    }

    if (isActive != null && isActive !== '') {
      const wanted = parseBoolean(isActive, true);
      items = items.filter((item) => item.is_active === wanted);
    }

    if (lowStock != null && lowStock !== '') {
      items = items.filter((item) => item.stock_quantity < 10);
    }

    return res.json({
      items: items.slice(offset, offset + safeLimit),
      total: items.length,
      page: safePage,
      limit: safeLimit
    });
  } catch (error) {
    console.error('Products Fetch Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const snapshot = await productRef(req.params.id).get();
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const categoriesMap = await loadCategoriesMap();
  return res.json({ item: await attachCategoryAndImages(snapshot, categoriesMap) });
});

router.post('/', async (req, res) => {
  if (!req.body || !req.body.name || req.body.price == null) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  const payload = await normalizeProductPayload(req.body);
  await productRef(payload.product_id).set(payload);

  const snapshot = await productRef(payload.product_id).get();
  const categoriesMap = await loadCategoriesMap();
  return res.status(201).json({ item: await attachCategoryAndImages(snapshot, categoriesMap) });
});

router.put('/:id', async (req, res) => {
  const snapshot = await productRef(req.params.id).get();
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const payload = await normalizeProductPayload(req.body, snapshot.data());
  await productRef(req.params.id).set(payload, { merge: true });

  const updated = await productRef(req.params.id).get();
  const categoriesMap = await loadCategoriesMap();
  return res.json({ item: await attachCategoryAndImages(updated, categoriesMap) });
});

router.patch('/:id/status', async (req, res) => {
  if (req.body.isActive == null) {
    return res.status(400).json({ error: 'isActive is required' });
  }

  const snapshot = await productRef(req.params.id).get();
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Product not found' });
  }

  await productRef(req.params.id).set(
    {
      is_active: parseBoolean(req.body.isActive, true),
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );

  const updated = await productRef(req.params.id).get();
  const categoriesMap = await loadCategoriesMap();
  return res.json({ item: await attachCategoryAndImages(updated, categoriesMap) });
});

router.delete('/:id', async (req, res) => {
  const snapshot = await productRef(req.params.id).get();
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Product not found' });
  }

  await productRef(req.params.id).delete();
  return res.json({ success: true });
});

module.exports = router;
