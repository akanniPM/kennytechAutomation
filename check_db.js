const db = require('./lib/db');

async function checkDatabase() {
  console.log("Connecting to Supabase PostgreSQL database...");
  try {
    const res = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    
    console.log("\n--- Public Tables Found ---");
    if (res.rows.length === 0) {
      console.log("No tables found. Schema needs to be initialized!");
    } else {
      res.rows.forEach(row => {
        console.log(`- ${row.table_name}`);
      });
    }
    
    console.log("\nChecking for Technicians...");
    const techRes = await db.query(`SELECT COUNT(*) FROM technicians;`).catch(e => ({ error: e.message }));
    if (techRes.error) {
      console.log(`Error checking technicians: ${techRes.error}`);
    } else {
      console.log(`Total Technicians logged: ${techRes.rows[0].count}`);
    }
    
  } catch (error) {
    console.error("Database connection/query failed:", error);
  } finally {
    db.pool.end();
  }
}

checkDatabase();
