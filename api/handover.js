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

  const { job_id, new_tech_id } = req.body;

  // Validation
  if (!job_id || !new_tech_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: job_id and new_tech_id are mandatory.'
    });
  }

  try {
    // 1. Verify if the job exists
    const checkJob = await db.query(
      'SELECT job_id, current_tech_id FROM repairs WHERE job_id = $1',
      [job_id]
    );

    if (checkJob.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Repair job not found.' });
    }

    const currentCustodyTech = checkJob.rows[0].current_tech_id;

    if (currentCustodyTech === new_tech_id) {
      return res.status(400).json({
        success: false,
        error: 'The device is already assigned to this technician.'
      });
    }

    // 2. Perform the update (This will trigger 'trig_repairs_handover_history' in PostgreSQL to append the logs)
    const updateQueryText = `
      UPDATE repairs
      SET current_tech_id = $1
      WHERE job_id = $2
      RETURNING job_id, client_name, device_info, primary_tech_id, current_tech_id, handover_logs, status;
    `;

    const result = await db.query(updateQueryText, [new_tech_id, job_id]);
    const updatedJob = result.rows[0];

    return res.status(200).json({
      success: true,
      message: 'Chain of custody handover logged and physical desk updated successfully.',
      data: updatedJob
    });

  } catch (error) {
    console.error('Error handling desk custody handover:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error. Unable to log handover.',
      details: error.message
    });
  }
};
