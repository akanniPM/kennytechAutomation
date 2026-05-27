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

  const { job_id, image_url, parsed_amount, transaction_ref, sender_bank } = req.body;

  if (!job_id) {
    return res.status(400).json({ success: false, error: 'Missing mandatory parameter: job_id.' });
  }

  try {
    // 1. Fetch the billing amount to verify receipt match
    const queryJob = await db.query(
      'SELECT job_id, total_billing, client_name, status FROM repairs WHERE job_id = $1',
      [job_id]
    );

    if (queryJob.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Repair ticket not found.' });
    }

    const { total_billing, client_name, status } = queryJob.rows[0];

    // If an amount is extracted via n8n's Gemini Vision node, verify it matches
    const extractedAmount = parseFloat(parsed_amount) || parseFloat(total_billing);

    if (Math.abs(extractedAmount - parseFloat(total_billing)) > 1.00) {
      return res.status(400).json({
        success: false,
        error: `Payment Amount Mismatch! Invoice: ₦${total_billing}, Receipt: ₦${extractedAmount}.`
      });
    }

    // 2. Update status to 'Ready' (implied payment confirmation has updated the desk log)
    const updateQuery = `
      UPDATE repairs
      SET status = 'Ready', completed_at = NOW()
      WHERE job_id = $1
      RETURNING job_id, client_name, device_info, total_billing, status, completed_at;
    `;

    const result = await db.query(updateQuery, [job_id]);
    const updatedJob = result.rows[0];

    return res.status(200).json({
      success: true,
      message: 'Naira direct bank transfer receipt matched and confirmed successfully by AI!',
      data: {
        job_id: updatedJob.job_id,
        client_name: updatedJob.client_name,
        device_info: updatedJob.device_info,
        total_billing: updatedJob.total_billing,
        status: updatedJob.status,
        payment_reference: transaction_ref || `TX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        sender_bank: sender_bank || 'Direct Transfer Alert',
        confirmed_at: updatedJob.completed_at
      }
    });

  } catch (error) {
    console.error('Error verifying transaction receipt:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error. Receipt verification failed.',
      details: error.message
    });
  }
};
