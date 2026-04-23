const crypto = require('crypto');
const db = require('../config/db');
const { parseBoolean, parseJsonArray, slugify, toNumber } = require('./format');

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function categoryRef(categoryId) {
  return db.collection('categories').doc(String(categoryId));
}

function productRef(productId) {
  return db.collection('products').doc(String(productId));
}

function userRef(userId) {
  return db.collection('users').doc(String(userId));
}

function orderRef(orderId) {
  return db.collection('orders').doc(String(orderId));
}

function ratingRef(ratingId) {
  return db.collection('ratings').doc(String(ratingId));
}

function addressRef(userId) {
  return db.collection('users').doc(String(userId)).collection('address').doc('default');
}

function cartRef(userId) {
  return db.collection('carts').doc(String(userId));
}

function paymentRef(paymentId) {
  return db.collection('payments').doc(String(paymentId));
}

function normalizeCategoryPayload(body = {}, existing = {}) {
  const name = body.name != null ? String(body.name).trim() : existing.name;
  const createdAt = existing.created_at || nowIso();

  return {
    category_id: existing.category_id || body.category_id || makeId('category'),
    name,
    slug: body.slug ? slugify(body.slug) : existing.slug || slugify(name),
    parent_id:
      body.parentId !== undefined
        ? body.parentId === '' || body.parentId == null
          ? null
          : String(body.parentId)
        : existing.parent_id || null,
    created_at: createdAt,
    updated_at: nowIso(),
    is_active:
      body.isActive !== undefined ? parseBoolean(body.isActive, true) : existing.is_active !== false,
    sort_order:
      body.sortOrder !== undefined ? toNumber(body.sortOrder, 0) : toNumber(existing.sort_order, 0),
    icon: body.icon !== undefined ? body.icon : existing.icon || null
  };
}

function categoryToApi(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    ...data,
    id: data.category_id,
    parent_id: data.parent_id || null,
    is_active: data.is_active !== false,
    sort_order: toNumber(data.sort_order, 0),
    child_count: toNumber(data.child_count, 0),
    product_count: toNumber(data.product_count, 0)
  };
}

function productToApi(doc, extra = {}) {
  const data = doc.data ? doc.data() : doc;
  const images = Array.isArray(data.image_urls)
    ? data.image_urls
    : parseJsonArray(data.images_json || data.image_url || '');
  const primaryImage = data.image_url || images[0] || null;
  const mrp = data.mrp != null ? Number(data.mrp) : null;
  const price = data.price != null ? Number(data.price) : null;

  return {
    ...data,
    ...extra,
    id: data.product_id,
    product_id: data.product_id,
    category_id: data.category_id || null,
    category: extra.category_name || data.category_name || data.category || null,
    brand: data.brand || '',
    price,
    mrp,
    original: mrp,
    discount: data.discount_percent != null ? Number(data.discount_percent) : 0,
    discount_percent: data.discount_percent != null ? Number(data.discount_percent) : 0,
    stock: data.stock_quantity != null ? Number(data.stock_quantity) : 0,
    stock_quantity: data.stock_quantity != null ? Number(data.stock_quantity) : 0,
    rating: data.avg_rating != null ? Number(data.avg_rating) : Number(data.rating || 0),
    avg_rating: data.avg_rating != null ? Number(data.avg_rating) : Number(data.rating || 0),
    is_active: data.is_active !== false,
    images,
    image_url: primaryImage
  };
}

let categoriesCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds

async function loadCategoriesMap() {
  const now = Date.now();
  if (categoriesCache && (now - lastCacheTime < CACHE_TTL)) {
    return categoriesCache;
  }

  const snapshot = await db.collection('categories').get();
  categoriesCache = snapshot.docs.reduce((acc, doc) => {
    acc[doc.id] = doc.data();
    return acc;
  }, {});
  lastCacheTime = now;
  return categoriesCache;
}

async function attachCategoryAndImages(productDoc, categoriesMap = {}) {
  const data = productDoc.data();
  const category = data.category_id ? categoriesMap[data.category_id] : null;

  return productToApi(data, {
    category_name: category ? category.name : null,
    category_slug: category ? category.slug : null,
    category_parent_id: category ? category.parent_id || null : null
  });
}

function deriveDiscount(price, mrp, discount) {
  if (discount != null && discount !== '') {
    return toNumber(discount, 0);
  }

  if (price != null && mrp != null && mrp > 0 && mrp >= price) {
    return Math.max(0, Math.round(((mrp - price) / mrp) * 100));
  }

  return 0;
}

async function normalizeProductPayload(body = {}, existing = {}) {
  const rawImages = body.images || body.imageUrls || body.image_urls || body.imagesJson;
  const isExplicitArray = Array.isArray(rawImages);
  
  // Deduplicate and clean URLs
  let images = [...new Set(parseJsonArray(rawImages))];

  const singleImage = body.imageUrl || body.image_url || existing.image_url || null;
  
  // Only fallback to existing primary image if we didn't receive an explicit array from client
  if (!isExplicitArray && !images.length && singleImage) {
    images.push(singleImage);
  }

  // Final primary image should be the first in the final gallery
  const primaryImage = images[0] || null;

  const price = body.price != null ? toNumber(body.price, null) : existing.price != null ? Number(existing.price) : null;
  const mrp =
    body.mrp != null && body.mrp !== ''
      ? toNumber(body.mrp, null)
      : body.original != null && body.original !== ''
        ? toNumber(body.original, null)
        : existing.mrp != null
          ? Number(existing.mrp)
          : null;

  return {
    product_id: existing.product_id || body.product_id || makeId('product'),
    name: body.name != null ? body.name : existing.name,
    brand: body.brand !== undefined ? body.brand : existing.brand || null,
    description: body.description !== undefined ? body.description : existing.description || null,
    category_id:
      body.categoryId !== undefined
        ? body.categoryId === '' || body.categoryId == null
          ? null
          : String(body.categoryId)
        : existing.category_id || null,
    price,
    mrp,
    discount_percent: deriveDiscount(price, mrp, body.discount ?? body.discount_percent ?? existing.discount_percent),
    stock_quantity:
      body.stock !== undefined
        ? Math.max(0, toNumber(body.stock, 0))
        : body.stock_quantity !== undefined
          ? Math.max(0, toNumber(body.stock_quantity, 0))
          : Math.max(0, toNumber(existing.stock_quantity, 100)),
    is_active:
      body.isActive !== undefined
        ? parseBoolean(body.isActive, true)
        : body.is_active !== undefined
          ? parseBoolean(body.is_active, true)
          : existing.is_active !== false,
    created_at: existing.created_at || nowIso(),
    updated_at: nowIso(),
    image_urls: images,
    image_url: primaryImage
  };
}

async function listCategories() {
  const snapshot = await db.collection('categories').orderBy('sort_order', 'asc').get();
  const docs = snapshot.docs.map((doc) => categoryToApi(doc));

  return docs.map((category) => {
    const childCount = docs.filter((item) => item.parent_id === category.category_id).length;
    return {
      ...category,
      child_count: childCount
    };
  });
}

function buildCategoryTree(categories, parentId = null, allIds = null) {
  if (allIds === null) {
    allIds = new Set(categories.map(c => c.category_id));
  }
  
  return categories
    .filter((item) => {
      if (parentId === null) {
        return item.parent_id == null || !allIds.has(item.parent_id);
      }
      return item.parent_id === parentId;
    })
    .map((item) => ({
      ...item,
      children: buildCategoryTree(categories, item.category_id, allIds)
    }));
}

async function listProducts() {
  const [categoriesMap, snapshot] = await Promise.all([
    loadCategoriesMap(),
    db.collection('products').orderBy('created_at', 'desc').get()
  ]);

  return Promise.all(snapshot.docs.map(doc => attachCategoryAndImages(doc, categoriesMap)));
}

module.exports = {
  addressRef,
  attachCategoryAndImages,
  buildCategoryTree,
  cartRef,
  categoryRef,
  categoryToApi,
  db,
  listCategories,
  listProducts,
  loadCategoriesMap,
  makeId,
  normalizeCategoryPayload,
  normalizeProductPayload,
  nowIso,
  orderRef,
  paymentRef,
  productRef,
  productToApi,
  ratingRef,
  userRef
};
