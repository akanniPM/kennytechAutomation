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

  const {
    job_id,
    part_id,
    qty,
    allocated_to,
    is_retail_purchase,
    retail_source,
    purchase_cost
  } = req.body;

  // Basic validation
  if (!job_id || !part_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameters: job_id and part_id are mandatory.'
    });
  }

  const quantity = parseInt(qty, 10) || 1;
  const isRetail = is_retail_purchase === true || is_retail_purchase === 'true';
  const cost = parseFloat(purchase_cost) || 0.00;

  try {
    // 1. If it's a warehouse part (not retail purchase), verify that we have enough stock first
    if (!isRetail) {
      const stockResult = await db.query(
        'SELECT qty_in_stock, part_name FROM inventory WHERE part_id = $1',
        [part_id]
      );

      if (stockResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Inventory part not found in catalog.' });
      }

      const { qty_in_stock, part_name } = stockResult.rows[0];

      if (qty_in_stock < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${part_name}. Available: ${qty_in_stock}, Requested: ${quantity}.`
        });
      }
    }

    // 2. Insert into parts_log (This will trigger 'trig_parts_log_allocation' in Postgres to auto-decrement stock)
    const logQueryText = `
      INSERT INTO parts_log (job_id, part_id, qty, allocated_to, is_retail_purchase, retail_source, purchase_cost)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING record_id, job_id, part_id, qty, is_retail_purchase, purchase_cost, timestamp;
    `;

    const logValues = [
      job_id,
      part_id,
      quantity,
      allocated_to || null,
      isRetail,
      isRetail ? (retail_source || 'Unknown Local Store') : null,
      isRetail ? cost : 0.00
    ];

    const result = await db.query(logQueryText, logValues);
    const newLogRecord = result.rows[0];

    return res.status(201).json({
      success: true,
      message: isRetail 
        ? 'Ad-hoc retail part procured and logged successfully.' 
        : 'Warehouse inventory part allocated successfully and stock decremented.',
      data: newLogRecord
    });

  } catch (error) {
    console.error('Error logging part allocation:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error. Unable to allocate part.',
      details: error.message
    });
  }
};
