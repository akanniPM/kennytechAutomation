const db = require('../lib/db');
const https = require('https');

// Ensure Paystack secret key is provided
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  console.error("WARNING: PAYSTACK_SECRET_KEY environment variable is missing.");
}

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

  const { job_id } = req.body;

  if (!job_id) {
    return res.status(400).json({ success: false, error: 'Missing required parameter: job_id.' });
  }

  try {
    // 1. Fetch invoice amount directly from the PostgreSQL repairs ledger
    const repairResult = await db.query(
      'SELECT job_id, client_name, client_phone, total_billing, device_info FROM repairs WHERE job_id = $1',
      [job_id]
    );

    if (repairResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Repair ticket not found.' });
    }

    const { client_name, client_phone, total_billing, device_info } = repairResult.rows[0];

    const amountInKobo = Math.round(parseFloat(total_billing) * 100); // Paystack expects amount in Kobo (kobo = naira * 100)

    if (amountInKobo <= 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid bill amount for Job #${job_id.substring(0, 8)}: ₦${total_billing}. Allocate parts or set cost first.`
      });
    }

    // Create a mock email for Paystack (which requires an email) based on phone number if email not gathered
    const mockEmail = `${client_phone}@fixflow.com`;

    // 2. Initialize Paystack Transaction
    const postData = JSON.stringify({
      email: mockEmail,
      amount: amountInKobo,
      callback_url: `https://fixflow-core.vercel.app/public/index.html?payment=success&job_id=${job_id}`,
      metadata: {
        job_id: job_id,
        client_name: client_name,
        device_info: device_info
      }
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const paystackReq = https.request(options, (paystackRes) => {
      let responseBody = '';

      paystackRes.on('data', (chunk) => {
        responseBody += chunk;
      });

      paystackRes.on('end', () => {
        try {
          const parsedData = JSON.parse(responseBody);
          if (parsedData.status && parsedData.data) {
            return res.status(200).json({
              success: true,
              message: 'Paystack Naira (₦) invoice link generated successfully.',
              data: {
                authorization_url: parsedData.data.authorization_url,
                reference: parsedData.data.reference,
                amount: total_billing
              }
            });
          } else {
            return res.status(400).json({
              success: false,
              error: 'Paystack API failed to initialize transaction.',
              details: parsedData.message || responseBody
            });
          }
        } catch (e) {
          return res.status(500).json({
            success: false,
            error: 'Failed to parse Paystack API response.',
            details: responseBody
          });
        }
      });
    });

    paystackReq.on('error', (err) => {
      console.error('Paystack Connection Error:', err);
      return res.status(500).json({
        success: false,
        error: 'Unable to connect to Paystack payment gateway.',
        details: err.message
      });
    });

    paystackReq.write(postData);
    paystackReq.end();

  } catch (error) {
    console.error('Error generating Paystack link:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error. Invoice link generation failed.',
      details: error.message
    });
  }
};
