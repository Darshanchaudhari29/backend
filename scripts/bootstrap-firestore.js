require('dotenv').config();
const db = require('../config/db');

const timestamp = new Date().toISOString();
const admin = db.admin;

/**
 * Bootstrap Firestore with schema metadata + seed data.
 * Idempotent — skips if documents already exist.
 */

// ─── Schema Metadata ─────────────────────────────────────────────────────────
const schemaDefinition = {
  version: '2026-04-17',
  applied_at: timestamp,
  collections: {
    users: ['user_id', 'name', 'email', 'password_hash', 'phone', 'role', 'created_at'],
    addresses: ['address_id', 'user_id', 'line1', 'line2', 'city', 'state', 'pincode', 'country'],
    categories: ['category_id', 'name', 'parent_id', 'created_at'],
    products: [
      'product_id', 'name', 'description', 'category_id', 'price', 'mrp',
      'discount_percent', 'stock_quantity', 'is_active', 'created_at', 'avg_rating'
    ],
    product_images: ['image_id', 'product_id', 'image_url'],
    carts: ['cart_id', 'user_id'],
    cart_items: ['cart_item_id', 'cart_id', 'product_id', 'quantity'],
    orders: ['order_id', 'user_id', 'total_amount', 'created_at'],
    order_items: ['order_item_id', 'order_id', 'product_id', 'price_at_purchase', 'quantity'],
    payments: ['payment_id', 'order_id', 'amount', 'method', 'status', 'transaction_ref', 'created_at'],
    ratings: ['rating_id', 'user_id', 'product_id', 'rating', 'created_at']
  },
  notes: [
    'user_id equals Firebase Auth UID',
    'cart_items stored under carts/{cart_id}/items (subcollection)',
    'order_items stored under orders/{order_id}/items (subcollection)',
    'addresses doc id equals user_id — enforces 1 address per user',
    'email uniqueness enforced in backend + Firebase Auth',
    'Firebase Auth handles password hashing — password_hash is null for new users'
  ]
};

// ─── Seed Categories ──────────────────────────────────────────────────────────
const seedCategories = [
  {
    category_id: 'cat_electronics',
    name: 'Electronics',
    parent_id: null,
    slug: 'electronics',
    is_active: true,
    sort_order: 0,
    created_at: timestamp
  },
  {
    category_id: 'cat_laptops',
    name: 'Laptops',
    parent_id: 'cat_electronics',
    slug: 'laptops',
    is_active: true,
    sort_order: 1,
    created_at: timestamp
  },
  {
    category_id: 'cat_ultrabooks',
    name: 'Ultrabooks',
    parent_id: 'cat_laptops',
    slug: 'ultrabooks',
    is_active: true,
    sort_order: 2,
    created_at: timestamp
  },
  {
    category_id: 'cat_phones',
    name: 'Smartphones',
    parent_id: 'cat_electronics',
    slug: 'smartphones',
    is_active: true,
    sort_order: 3,
    created_at: timestamp
  },
  {
    category_id: 'cat_audio',
    name: 'Audio',
    parent_id: 'cat_electronics',
    slug: 'audio',
    is_active: true,
    sort_order: 4,
    created_at: timestamp
  },
  {
    category_id: 'cat_gaming',
    name: 'Gaming',
    parent_id: 'cat_electronics',
    slug: 'gaming',
    is_active: true,
    sort_order: 5,
    created_at: timestamp
  },
  {
    category_id: 'cat_wearables',
    name: 'Wearables',
    parent_id: 'cat_electronics',
    slug: 'wearables',
    is_active: true,
    sort_order: 6,
    created_at: timestamp
  }
];

// ─── Seed Products ────────────────────────────────────────────────────────────
const seedProducts = [
  {
    product_id: 'prod_zenbook',
    name: 'ASUS Zenbook S 14',
    description: 'Ultra-thin Copilot+ notebook with OLED display, Intel Core Ultra 9, 32GB RAM.',
    category_id: 'cat_ultrabooks',
    price: 129990,
    mrp: 149990,
    discount_percent: 13,
    stock_quantity: 24,
    is_active: true,
    avg_rating: 4.9,
    created_at: timestamp,
    updated_at: timestamp
  },
  {
    product_id: 'prod_iphone15pm',
    name: 'iPhone 15 Pro Max',
    description: 'Titanium frame, A17 Pro chip, 48MP ProRAW camera system.',
    category_id: 'cat_phones',
    price: 134900,
    mrp: 149900,
    discount_percent: 10,
    stock_quantity: 8,
    is_active: true,
    avg_rating: 4.8,
    created_at: timestamp,
    updated_at: timestamp
  },
  {
    product_id: 'prod_sony_xm5',
    name: 'Sony WH-1000XM5',
    description: 'Industry-leading active noise cancelling with 30-hour battery and multipoint.',
    category_id: 'cat_audio',
    price: 26990,
    mrp: 34990,
    discount_percent: 23,
    stock_quantity: 6,
    is_active: true,
    avg_rating: 4.8,
    created_at: timestamp,
    updated_at: timestamp
  },
  {
    product_id: 'prod_ps5_slim',
    name: 'PlayStation 5 Slim',
    description: 'Next-gen gaming with ray tracing, 4K HDR, and DualSense haptic feedback.',
    category_id: 'cat_gaming',
    price: 44990,
    mrp: 54990,
    discount_percent: 18,
    stock_quantity: 3,
    is_active: true,
    avg_rating: 4.8,
    created_at: timestamp,
    updated_at: timestamp
  },
  {
    product_id: 'prod_apple_watch9',
    name: 'Apple Watch Series 9',
    description: 'Health-first smartwatch with double tap gesture and always-on Retina display.',
    category_id: 'cat_wearables',
    price: 41900,
    mrp: 46900,
    discount_percent: 11,
    stock_quantity: 15,
    is_active: true,
    avg_rating: 4.7,
    created_at: timestamp,
    updated_at: timestamp
  }
];

// ─── Seed Product Images ──────────────────────────────────────────────────────
const seedImages = [
  { image_id: 'img_zenbook_1', product_id: 'prod_zenbook', image_url: 'https://images.unsplash.com/photo-1498050108023-78a9c73d7a75?w=900&q=80' },
  { image_id: 'img_iphone_1', product_id: 'prod_iphone15pm', image_url: 'https://images.unsplash.com/photo-1696426035636-68f5c8e5bf7e?w=900&q=80' },
  { image_id: 'img_sony_1', product_id: 'prod_sony_xm5', image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=900&q=80' },
  { image_id: 'img_ps5_1', product_id: 'prod_ps5_slim', image_url: 'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=900&q=80' },
  { image_id: 'img_watch_1', product_id: 'prod_apple_watch9', image_url: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=900&q=80' }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function docExists(ref) {
  const snap = await ref.get();
  return snap.exists;
}

// ─── Main Bootstrap ───────────────────────────────────────────────────────────
async function main() {
  console.log('🦴 Caveman starting Firestore bootstrap...\n');

  // 1. Schema metadata
  await db.collection('_meta').doc('schema').set(schemaDefinition, { merge: true });
  await db.collection('_meta').doc('bootstrap').set({ applied_at: timestamp, version: schemaDefinition.version }, { merge: true });
  console.log('✅ Schema metadata written to _meta/schema');

  // 2. Seed categories
  let catCount = 0;
  for (const cat of seedCategories) {
    const ref = db.collection('categories').doc(cat.category_id);
    if (!(await docExists(ref))) {
      await ref.set(cat);
      catCount++;
    }
  }
  console.log(`✅ Categories: ${catCount} new seeded (${seedCategories.length - catCount} already existed)`);

  // 3. Seed products
  let prodCount = 0;
  for (const prod of seedProducts) {
    const ref = db.collection('products').doc(prod.product_id);
    if (!(await docExists(ref))) {
      await ref.set(prod);
      prodCount++;
    }
  }
  console.log(`✅ Products: ${prodCount} new seeded (${seedProducts.length - prodCount} already existed)`);

  // 4. Seed product images
  let imgCount = 0;
  for (const img of seedImages) {
    const ref = db.collection('product_images').doc(img.image_id);
    if (!(await docExists(ref))) {
      await ref.set({ ...img, created_at: timestamp });
      imgCount++;
    }
  }
  console.log(`✅ Product images: ${imgCount} new seeded`);

  // 5. Create admin user in Firebase Auth + Firestore
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@zepto.tech';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const adminName = process.env.SEED_ADMIN_NAME || 'Zepto Admin';

  try {
    // Check if admin user exists in Firebase Auth
    let adminFirebaseUser;
    try {
      adminFirebaseUser = await admin.auth().getUserByEmail(adminEmail);
      console.log(`ℹ️  Admin Firebase Auth user already exists: ${adminEmail}`);
    } catch (notFound) {
      // Create in Firebase Auth
      adminFirebaseUser = await admin.auth().createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: adminName,
        emailVerified: true
      });
      console.log(`✅ Admin Firebase Auth user created: ${adminEmail}`);
    }

    // Create/update Firestore user doc
    const adminDocRef = db.collection('users').doc(adminFirebaseUser.uid);
    const exists = await docExists(adminDocRef);
    if (!exists) {
      await adminDocRef.set({
        user_id: adminFirebaseUser.uid,
        name: adminName,
        email: adminEmail,
        password_hash: null,
        phone: null,
        role: 'admin',
        created_at: timestamp,
        updated_at: timestamp
      });
      console.log(`✅ Admin Firestore user doc created`);
    } else {
      // Ensure role is admin
      await adminDocRef.set({ role: 'admin', updated_at: timestamp }, { merge: true });
      console.log(`ℹ️  Admin Firestore user doc already exists — role enforced`);
    }
  } catch (error) {
    console.error('⚠️  Admin user setup error (non-fatal):', error.message);
    console.log('   → Make sure FIREBASE_SERVICE_ACCOUNT_KEY is set in backend/.env');
  }

  console.log('\n🦴 Bootstrap complete! Firestore cave is ready.\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
