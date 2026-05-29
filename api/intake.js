const db = require('../lib/db');

module.exports = async (req, res) => {
  // Set CORS headers for Vercel cross-origin calls
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
  }

  const { client_name, client_phone, device_info, assigned_tech_id, service_charge, service_charge_note } = req.body;

  // Basic validation
  if (!client_name || !client_phone || !device_info) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: client_name, client_phone, device_info are mandatory.'
    });
  }

  // Build initial service_charges array.
  // Each entry: { amount, note, added_at }
  // More entries can be appended as diagnostics progress via a separate update.
  const initialCharges = [];
  if (service_charge) {
    const chargeAmount = parseFloat(service_charge);
    if (isNaN(chargeAmount) || chargeAmount < 0) {
      return res.status(400).json({ success: false, error: 'Invalid service_charge value. Must be a positive number.' });
    }
    initialCharges.push({
      amount: chargeAmount,
      note: service_charge_note || 'Initial service charge',
      added_at: new Date().toISOString()
    });
  }

  try {
    const queryText = `
      INSERT INTO repairs (client_name, client_phone, device_info, primary_tech_id, current_tech_id, status, service_charges)
      VALUES ($1, $2, $3, $4, $4, 'Intake', $5)
      RETURNING job_id, client_name, client_phone, device_info, status, service_charges, checked_in_at;
    `;

    const values = [client_name, client_phone, device_info, assigned_tech_id || null, JSON.stringify(initialCharges)];
    const result = await db.query(queryText, values);

    const newTicket = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Repair ticket initialized successfully.',
      data: newTicket
    });

  } catch (error) {
    console.error('Error logging intake repair ticket:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error. Unable to save ticket.',
      details: error.message
    });
  }
};
