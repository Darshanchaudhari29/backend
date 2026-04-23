const express = require('express');
const db = require('../config/db');
const Razorpay = require('razorpay');
const { toNumber } = require('../utils/format');
const {
  attachCategoryAndImages,
  buildCategoryTree,
  cartRef,
  categoryRef,
  listCategories,
  listProducts,
  loadCategoriesMap,
  makeId,
  nowIso,
  orderRef,
  paymentRef,
  productRef
} = require('../utils/firestore');

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




router.get('/categories', async (req, res) => {
  const categories = await listCategories();
  return res.json({ items: buildCategoryTree(categories) });
});

router.get('/products', async (req, res) => {
  const { category, categoryId, search, page = 1, limit = 24 } = req.query;
  const safePage = Math.max(toNumber(page, 1), 1);
  const safeLimit = Math.max(toNumber(limit, 24), 1);
  const offset = (safePage - 1) * safeLimit;

  try {
    const categoriesMap = await loadCategoriesMap();
    let query = db.collection('products').where('is_active', '==', true);

    if (categoryId) {
      query = query.where('category_id', '==', String(categoryId));
    }

    // For simple listing without search, use optimized query
    if (!search && (!category || category === 'all')) {
      const snapshot = await query.limit(safeLimit + offset).get();
      const docs = snapshot.docs.slice(offset);
      const items = await Promise.all(docs.map(doc => attachCategoryAndImages(doc, categoriesMap)));

      return res.json({
        items,
        total: items.length + offset, // Approximate or fetch count separately if needed
        page: safePage,
        limit: safeLimit
      });
    }

    // Fallback to full list for search/complex filters
    let items = await listProducts();
    items = items.filter(item => item.is_active);

    if (category && category !== 'all') {
      const needle = String(category).toLowerCase();
      items = items.filter(
        (item) =>
          String(item.category || '').toLowerCase() === needle ||
          String(item.category_slug || '').toLowerCase() === needle
      );
    }

    if (search) {
      const term = String(search).toLowerCase();
      items = items.filter((item) =>
        [item.name, item.description, item.category].join(' ').toLowerCase().includes(term)
      );
    }

    return res.json({
      items: items.slice(offset, offset + safeLimit),
      total: items.length,
      page: safePage,
      limit: safeLimit
    });
  } catch (error) {
    console.error('Public Products Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/products/recommended', async (req, res) => {
  const items = (await listProducts())
    .filter((item) => item.is_active)
    .sort((a, b) => {
      if (b.stock_quantity !== a.stock_quantity) {
        return b.stock_quantity - a.stock_quantity;
      }

      if (b.avg_rating !== a.avg_rating) {
        return b.avg_rating - a.avg_rating;
      }

      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    })
    .slice(0, 6);

  return res.json(items);
});

router.post('/checkout', async (req, res) => {
  const { items, totalAmount, shippingMethod, paymentMethod, email, userId, shipping } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  try {
    const orderId = makeId('order');
    const paymentId = makeId('payment');
    const shippingInfo = shipping || {};
    const createdAt = nowIso();
    
    let razorpayOrder = null;
    const isOnlinePayment = paymentMethod === 'online' || paymentMethod === 'razorpay';

    await db.runTransaction(async (transaction) => {
      let computedTotal = 0;
      // ... (existing loop)

      for (const item of items) {
        const productId = String(item.id || item.productId || item.product_id || '');
        if (!productId) throw new Error('Invalid product ID in checkout');

        const quantity = Math.max(toNumber(item.quantity, 1), 1);
        const productSnapshot = await transaction.get(productRef(productId));

        if (!productSnapshot.exists) {
          throw new Error(`Product not found: ${productId}`);
        }

        const product = productSnapshot.data();
        if (toNumber(product.stock_quantity, 0) < quantity) {
          throw new Error(`Not enough stock for ${product.name}`);
        }

        const unitPrice = toNumber(product.price, 0); 
        computedTotal += unitPrice * quantity;

        transaction.update(productRef(productId), {
          stock_quantity: toNumber(product.stock_quantity, 0) - quantity,
          updated_at: createdAt
        });

        const orderItemId = makeId('order_item');
        transaction.set(orderRef(orderId).collection('items').doc(orderItemId), {
          order_item_id: orderItemId,
          order_id: orderId,
          product_id: productId,
          product_name: product.name || 'Unknown Product',
          product_image: product.image_url || (Array.isArray(product.image_urls) && product.image_urls[0]) || null,
          price_at_purchase: unitPrice,
          quantity,
          created_at: createdAt
        });
      }

      const taxAmount = Math.round(computedTotal * 0.18);
      const grandTotal = computedTotal + taxAmount;

      if (isOnlinePayment) {
        const amountInPaise = Math.round(grandTotal * 100);
        if (amountInPaise < 100) {
          throw new Error('Minimum amount for online payment is ₹1.00');
        }
        try {
          razorpayOrder = await getRazorpay().orders.create({
            amount: amountInPaise, 
            currency: 'INR',
            receipt: orderId
          });
        } catch (rzpErr) {
          console.error('Razorpay Error:', rzpErr);
          throw new Error('Online payment initialization failed.');
        }
      }

      transaction.set(orderRef(orderId), {
        order_id: orderId,
        user_id: userId || null,
        order_status: isOnlinePayment ? 'pending_payment' : 'placed',
        subtotal: computedTotal,
        tax: taxAmount,
        total_amount: grandTotal,
        item_count: items.length,
        created_at: createdAt,
        shipping_method: shippingMethod || null,
        shipping_email: shippingInfo.email || email || null,
        shipping_phone: shippingInfo.phone || null,
        shipping_name: shippingInfo.name || shippingInfo.shippingName || null,
        shipping_address: {
          building: shippingInfo.building || null,
          street: shippingInfo.street || null,
          village_city: shippingInfo.village_city || null,
          state: shippingInfo.state || null,
          pincode: shippingInfo.pincode || shippingInfo.pin || null
        },
        payment_method: paymentMethod || 'cod',
        razorpay_order_id: razorpayOrder ? razorpayOrder.id : null
      });

      transaction.set(paymentRef(paymentId), {
        payment_id: paymentId,
        order_id: orderId,
        amount: grandTotal,
        method: paymentMethod || 'cod',
        status: isOnlinePayment ? 'pending' : 'success',
        transaction_ref: razorpayOrder ? razorpayOrder.id : makeId('txn'),
        created_at: createdAt
      });

      if (userId) {
        transaction.set(cartRef(userId), {
          cart_id: String(userId),
          user_id: String(userId),
          updated_at: createdAt
        }, { merge: true });
      }
    });

    return res.status(201).json({
      success: true,
      orderId,
      razorpayOrder
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: error.message || 'Checkout failed' });
  }
});

module.exports = router;
