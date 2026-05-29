const db = require('./lib/db');

async function seedDatabase() {
  console.log("Seeding Supabase database with default technicians and stock...");
  try {
    // 1. Insert Technicians
    const seedTechQuery = `
      INSERT INTO technicians (tech_id, name, specialization, is_active)
      VALUES 
        ('11111111-1111-4111-b111-111111111111', 'Tunde', 'Screens & Batteries', TRUE),
        ('22222222-2222-4222-b222-222222222222', 'Alex', 'Micro-Soldering & Logic Boards', TRUE)
      ON CONFLICT (name) DO UPDATE 
      SET specialization = EXCLUDED.specialization, is_active = EXCLUDED.is_active;
    `;
    await db.query(seedTechQuery);
    console.log("✅ Technicians seeded successfully!");

    // 2. Insert Inventory Parts
    const seedInventoryQuery = `
      INSERT INTO inventory (part_id, part_name, qty_in_stock, unit_cost, selling_price, threshold_alert)
      VALUES 
        ('a1111111-1111-4111-b111-111111111111', 'iPhone 13 Pro Screen', 15, 35000.00, 50000.00, 3),
        ('a2222222-2222-4222-b222-222222222222', 'MacBook M1 Audio Chip', 8, 8000.00, 12000.00, 2),
        ('eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee', 'Ad-hoc Retail Part', 9999, 0.00, 0.00, 0)
      ON CONFLICT (part_name) DO UPDATE 
      SET qty_in_stock = EXCLUDED.qty_in_stock, 
          unit_cost = EXCLUDED.unit_cost, 
          selling_price = EXCLUDED.selling_price, 
          threshold_alert = EXCLUDED.threshold_alert;
    `;
    await db.query(seedInventoryQuery);
    console.log("✅ Inventory catalog seeded successfully!");

  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    db.pool.end();
  }
}

seedDatabase();
