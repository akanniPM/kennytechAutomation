const db = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
  }

  const { supplier_name, invoice_number, total_cost, restock_items } = req.body;

  // Validation
  if (!supplier_name || !invoice_number || !Array.isArray(restock_items) || restock_items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: supplier_name, invoice_number, and restock_items (Array) are mandatory.'
    });
  }

  const client = await db.pool.connect();

  try {
    // Start atomic transaction
    await client.query('BEGIN');

    // 1. Log the overall Wholesale Invoice Receipt
    const receiptQuery = `
      INSERT INTO wholesale_receipts (supplier_name, invoice_number, total_cost, items_parsed)
      VALUES ($1, $2, $3, $4)
      RETURNING import_id, supplier_name, invoice_number, total_cost;
    `;

    const itemsSummary = restock_items.map(item => `${item.qty}x ${item.part_name}`).join(', ');
    const receiptResult = await client.query(receiptQuery, [
      supplier_name,
      invoice_number,
      parseFloat(total_cost) || 0.00,
      itemsSummary
    ]);

    const importReceipt = receiptResult.rows[0];

    // 2. Process each restocked item (Upsert logic: Insert new or increment quantity + update cost)
    for (const item of restock_items) {
      const { part_name, qty, unit_cost, selling_price, threshold_alert } = item;

      if (!part_name || !qty) continue;

      const itemQuantity = parseInt(qty, 10) || 0;
      const cost = parseFloat(unit_cost) || 0.00;
      const price = parseFloat(selling_price) || (cost * 1.5); // Fallback: 50% markup if selling price not found
      const alertLimit = parseInt(threshold_alert, 10) || 3;

      const upsertQuery = `
        INSERT INTO inventory (part_name, qty_in_stock, unit_cost, selling_price, threshold_alert)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (part_name) DO UPDATE
        SET 
          qty_in_stock = inventory.qty_in_stock + EXCLUDED.qty_in_stock,
          unit_cost = EXCLUDED.unit_cost,
          selling_price = EXCLUDED.selling_price,
          threshold_alert = EXCLUDED.threshold_alert
        RETURNING part_id, part_name, qty_in_stock;
      `;

      await client.query(upsertQuery, [part_name, itemQuantity, cost, price, alertLimit]);
    }

    // Commit transaction
    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'AI stock intake successfully executed. Inventory database updated.',
      data: importReceipt
    });

  } catch (error) {
    // Rollback on any failure to preserve database integrity
    await client.query('ROLLBACK');
    console.error('Error executing database restock transaction:', error);

    return res.status(500).json({
      success: false,
      error: 'Transaction failed. Database rolled back to preserve stock integrity.',
      details: error.message
    });
  } finally {
    client.release();
  }
};
