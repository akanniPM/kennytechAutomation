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

  const { job_id, new_tech_id, labor_charge } = req.body;

  // Validation
  if (!job_id || !new_tech_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: job_id and new_tech_id are mandatory.'
    });
  }

  try {
    // 1. Verify if the job exists and fetch the outgoing technician's ID
    const checkJob = await db.query(
      'SELECT job_id, current_tech_id FROM repairs WHERE job_id = $1',
      [job_id]
    );

    if (checkJob.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Repair job not found.' });
    }

    const outgoingTechId = checkJob.rows[0].current_tech_id;

    if (outgoingTechId === new_tech_id) {
      return res.status(400).json({
        success: false,
        error: 'The device is already assigned to this technician.'
      });
    }

    // 2. Fetch the outgoing technician's name to record their earnings entry
    let outgoingTechName = 'Reception (Secretary)';
    if (outgoingTechId) {
      const techResult = await db.query(
        'SELECT name FROM technicians WHERE tech_id = $1',
        [outgoingTechId]
      );
      if (techResult.rows.length > 0) {
        outgoingTechName = techResult.rows[0].name;
      }
    }

    // 3. Build the earnings entry for the outgoing tech.
    //    labor_charge is the amount attributed to them for the work done so far.
    const earningsEntry = JSON.stringify([{
      tech_id: outgoingTechId,
      tech_name: outgoingTechName,
      labor_charge: parseFloat(labor_charge) || 0.00,
      recorded_at: new Date().toISOString()
    }]);

    // 4. Perform the handover update.
    //    The DB trigger (trig_repairs_handover_history) appends the human-readable log.
    //    We also append the outgoing tech's earnings entry to tech_earnings here.
    const updateQueryText = `
      UPDATE repairs
      SET 
        current_tech_id = $1,
        tech_earnings = tech_earnings || $3::jsonb
      WHERE job_id = $2
      RETURNING job_id, client_name, device_info, primary_tech_id, current_tech_id, handover_logs, tech_earnings, status;
    `;

    const result = await db.query(updateQueryText, [new_tech_id, job_id, earningsEntry]);
    const updatedJob = result.rows[0];

    return res.status(200).json({
      success: true,
      message: 'Chain of custody handover logged and physical desk updated successfully.',
      data: {
        ...updatedJob,
        outgoing_tech: {
          tech_id: outgoingTechId,
          tech_name: outgoingTechName,
          labor_charge_recorded: parseFloat(labor_charge) || 0.00
        }
      }
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
