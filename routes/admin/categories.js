const express = require('express');
const { authRequired } = require('../../middleware/auth');
const {
  buildCategoryTree,
  categoryRef,
  categoryToApi,
  listCategories,
  normalizeCategoryPayload
} = require('../../utils/firestore');
const db = require('../../config/db');

const router = express.Router();

router.use(authRequired);

router.get('/', async (req, res) => {
  const rows = await listCategories();
  return res.json({
    items: buildCategoryTree(rows)
  });
});

router.get('/flat', async (req, res) => {
  const rows = await listCategories();
  return res.json({
    items: rows
  });
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const payload = normalizeCategoryPayload(req.body);
  await categoryRef(payload.category_id).set(payload);
  return res.status(201).json({ item: categoryToApi(payload) });
});

router.put('/:id', async (req, res) => {
  const existingSnapshot = await categoryRef(req.params.id).get();
  if (!existingSnapshot.exists) {
    return res.status(404).json({ error: 'Category not found' });
  }

  const payload = normalizeCategoryPayload(req.body, existingSnapshot.data());
  await categoryRef(req.params.id).set(payload, { merge: true });
  return res.json({ item: categoryToApi(payload) });
});

router.delete('/:id', async (req, res) => {
  const categories = await listCategories();
  if (categories.some((item) => item.parent_id === req.params.id)) {
    return res.status(409).json({ error: 'Remove child categories first' });
  }

  const productSnapshot = await db.collection('products').where('category_id', '==', req.params.id).limit(1).get();
  if (!productSnapshot.empty) {
    return res.status(409).json({ error: 'Move products away from this category first' });
  }

  const snapshot = await categoryRef(req.params.id).get();
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Category not found' });
  }

  await categoryRef(req.params.id).delete();
  return res.json({ success: true });
});

module.exports = router;
