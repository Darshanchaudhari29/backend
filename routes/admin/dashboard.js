const express = require('express');
const { authRequired } = require('../../middleware/auth');
const { db, listProducts } = require('../../utils/firestore');
const admin = require('firebase-admin');

const router = express.Router();

router.use(authRequired);

router.get('/', async (req, res) => {
  try {
    // Optimized: Use aggregation queries for fast counts and sums
    const [statsSnap, activeSnap, lowStockSnap, products, itemsSnapshot] = await Promise.all([
      db.collection('orders').aggregate({
        totalSales: admin.firestore.AggregateField.sum('total_amount'),
        count: admin.firestore.AggregateField.count()
      }).get(),
      db.collection('products').where('is_active', '==', true).count().get(),
      db.collection('products').where('stock_quantity', '<', 10).count().get(),
      listProducts(),
      db.collectionGroup('items').limit(100).get()
    ]);

    const stats = statsSnap.data();
    const totalSales = Number(stats.totalSales || 0);
    const totalOrders = stats.count;
    const activeProducts = activeSnap.data().count;
    const lowStockCount = lowStockSnap.data().count;

    const productStats = {};
    itemsSnapshot.docs.forEach((itemDoc) => {
      const item = itemDoc.data();
      const productId = item.product_id;
      if (!productStats[productId]) {
        productStats[productId] = {
          id: productId,
          name: item.product_name || 'Unknown',
          image_url: item.product_image || null,
          unitsSold: 0,
          revenue: 0
        };
      }
      productStats[productId].unitsSold += Number(item.quantity || 0);
      productStats[productId].revenue += Number(item.price_at_purchase || 0) * Number(item.quantity || 0);
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);

    return res.json({
      totalSales,
      paidSales: totalSales,
      totalOrders,
      activeProducts,
      lowStockCount,
      topProducts
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    // Fallback to manual calculation if aggregation fails (unlikely with admin SDK 13+)
    const ordersSnapshot = await db.collection('orders').get();
    let totalSales = 0;
    ordersSnapshot.docs.forEach(d => totalSales += Number(d.data().total_amount || 0));
    
    return res.json({
      totalSales,
      totalOrders: ordersSnapshot.size,
      topProducts: []
    });
  }
});

module.exports = router;
