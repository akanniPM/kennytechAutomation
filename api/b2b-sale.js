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
    buyer_hub_name,
    buyer_phone,
    part_name,       // Name of the part being sold e.g. "Samsung S21 Battery"
    part_id,         // Optional UUID — use this if you already have it; otherwise part_name is used to look it up
    qty,
    price_charged,
    payment_status
  } = req.body;

  // Validation — need buyer info, at least one part identifier, and a price
  if (!buyer_hub_name || !buyer_phone || (!part_name && !part_id) || !price_charged) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: buyer_hub_name, buyer_phone, price_charged, and either part_name or part_id are mandatory.'
    });
  }

  const quantity = parseInt(qty, 10) || 1;
  const price = parseFloat(price_charged) || 0.00;
  const status = payment_status || 'Pending';

  try {
    // 0. Resolve part_id from part_name if not provided directly
    let resolvedPartId = part_id || null;

    if (!resolvedPartId) {
      const nameResult = await db.query(
        'SELECT part_id FROM inventory WHERE LOWER(part_name) = LOWER($1)',
        [part_name.trim()]
      );
      if (nameResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: `Part "${part_name}" not found in inventory catalog. Check the name or add it via restock first.`
        });
      }
      resolvedPartId = nameResult.rows[0].part_id;
    }

    // 1. Verify stock availability first
    const stockResult = await db.query(
      'SELECT qty_in_stock, part_name FROM inventory WHERE part_id = $1',
      [resolvedPartId]
    );

    if (stockResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found in inventory catalog.' });
    }

    const { qty_in_stock, part_name } = stockResult.rows[0];

    if (qty_in_stock < quantity) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock for wholesale. ${part_name} available: ${qty_in_stock}, requested: ${quantity}.`
      });
    }

    // 2. Insert into b2b_sales (Triggers database-side 'trig_b2b_sales_allocation' to decrement inventory)
    const saleQueryText = `
      INSERT INTO b2b_sales (buyer_hub_name, buyer_phone, part_id, qty, price_charged, payment_status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING transaction_id, buyer_hub_name, buyer_phone, part_id, qty, price_charged, payment_status, sold_at;
    `;

    const saleValues = [
      buyer_hub_name,
      buyer_phone,
      resolvedPartId,
      quantity,
      price,
      status
    ];

    const result = await db.query(saleQueryText, saleValues);
    const newB2BSale = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Wholesale B2B transaction logged and stock deducted successfully.',
      data: newB2BSale
    });

  } catch (error) {
    console.error('Error logging B2B wholesale transaction:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error. Unable to log B2B sale.',
      details: error.message
    });
  }
};
