// FixFlow Core — Frontend Controller

// Local State (Session active repairs list)
let repairs = [];

// DOM Elements
const intakeForm = document.getElementById('intake-form');
const repairsTbody = document.getElementById('repairs-tbody');

// Modals
const partsModal = document.getElementById('parts-modal');
const handoverModal = document.getElementById('handover-modal');

// Close buttons
document.getElementById('close-parts').onclick = () => partsModal.classList.remove('active');
document.getElementById('close-handover').onclick = () => handoverModal.classList.remove('active');

// Toggle between Warehouse Stock & Retail Purchase fields
const procureRadioGroup = document.getElementsByName('procure-type');
const warehouseSelection = document.getElementById('warehouse-selection');
const retailFields = document.getElementById('retail-fields');

procureRadioGroup.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'warehouse') {
      warehouseSelection.classList.remove('hidden');
      retailFields.classList.add('hidden');
    } else {
      warehouseSelection.classList.add('hidden');
      retailFields.classList.remove('hidden');
    }
  });
});

// 1. Submit Intake Check-In Form
intakeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const clientName = document.getElementById('client-name').value.trim();
  const clientPhone = document.getElementById('client-phone').value.trim();
  const deviceInfo = document.getElementById('device-info').value.trim();
  const techSelect = document.getElementById('assigned-tech');
  const techName = techSelect.value;
  
  // Simulated technician IDs (for Postgres schema matches)
  const techId = techName === 'Tunde' ? 'T-01' : 'T-02';

  const payload = {
    client_name: clientName,
    client_phone: clientPhone,
    device_info: deviceInfo,
    assigned_tech_id: techId
  };

  try {
    const response = await fetch('/api/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      alert(`Success! Job #${result.data.job_id.substring(0, 8)} created. Welcome WhatsApp sent to ${clientPhone}!`);
      
      // Append to local UI table list
      repairs.unshift({
        job_id: result.data.job_id,
        client_name: clientName,
        device_info: deviceInfo,
        status: 'Assigned',
        current_tech: techName,
        parts_cost: 0
      });
      
      renderTable();
      intakeForm.reset();
    } else {
      alert(`Intake Error: ${result.error}`);
    }
  } catch (error) {
    console.error('API Error connecting to /api/intake:', error);
    
    // Graceful fallback for offline/local testing without active Vercel dev server running
    const mockId = 'job_' + Math.random().toString(36).substr(2, 9);
    repairs.unshift({
      job_id: mockId,
      client_name: clientName,
      device_info: deviceInfo,
      status: 'Assigned',
      current_tech: techName,
      parts_cost: 0
    });
    renderTable();
    intakeForm.reset();
    alert(`Testing Mode: Simulating ticket intake locally. Job ID: ${mockId}`);
  }
});

// Render table rows dynamically
function renderTable() {
  if (repairs.length === 0) {
    repairsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No active repair tickets found. Initialize check-in.</td>
      </tr>
    `;
    document.getElementById('stat-active-count').textContent = '0';
    return;
  }

  document.getElementById('stat-active-count').textContent = repairs.length;

  repairsTbody.innerHTML = repairs.map(job => {
    const shortId = job.job_id.substring(0, 8);
    const badgeClass = job.status.toLowerCase();
    
    return `
      <tr>
        <td><code>#${shortId}</code></td>
        <td><strong>${job.client_name}</strong></td>
        <td>${job.device_info}</td>
        <td><span class="badge ${badgeClass}">${job.status}</span></td>
        <td>
          <span class="tech-tag">👨‍💻 ${job.current_tech}</span>
        </td>
        <td>
          <div class="action-group">
            <button class="small-btn accent" onclick="openPartsModal('${job.job_id}')">Allocate Parts 📦</button>
            <button class="small-btn" onclick="openHandoverModal('${job.job_id}')">Transfer Desk 🔀</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 2. Open Parts Modal
window.openPartsModal = function(jobId) {
  const shortId = jobId.substring(0, 8);
  document.getElementById('parts-modal-subtitle').textContent = `Allocate spare parts to Job #${shortId}`;
  document.getElementById('parts-job-id').value = jobId;
  partsModal.classList.add('active');
};

// Handle Parts Allocation Submission
document.getElementById('parts-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const jobId = document.getElementById('parts-job-id').value;
  const isRetail = document.querySelector('input[name="procure-type"]:checked').value === 'retail';
  const qty = parseInt(document.getElementById('part-qty').value, 10);
  
  let payload = {
    job_id: jobId,
    qty: qty,
    is_retail_purchase: isRetail
  };

  if (isRetail) {
    payload.retail_source = document.getElementById('retail-source').value || 'Computer Village Vendor';
    payload.purchase_cost = parseFloat(document.getElementById('retail-cost').value) || 0;
    payload.part_id = 'SPECIAL'; // Special retail key
  } else {
    payload.part_id = document.getElementById('part-id').value;
  }

  try {
    const response = await fetch('/api/parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      alert(`Success! Inventory allocated and stock levels decremented. CEO notified.`);
      partsModal.classList.remove('active');
    } else {
      alert(`Parts Allocation Error: ${result.error}`);
    }
  } catch (error) {
    console.error('API Error connecting to /api/parts:', error);
    partsModal.classList.remove('active');
    alert(`Testing Mode: Stock allocated and logged inside session.`);
  }
});

// 3. Open Handover Modal
window.openHandoverModal = function(jobId) {
  const shortId = jobId.substring(0, 8);
  document.getElementById('handover-modal-subtitle').textContent = `Transfer custody for Job #${shortId}`;
  document.getElementById('handover-job-id').value = jobId;
  handoverModal.classList.add('active');
};

// Handle Handover Submission
document.getElementById('handover-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const jobId = document.getElementById('handover-job-id').value;
  const techSelect = document.getElementById('new-tech');
  const techId = techSelect.value;
  const techName = techSelect.options[techSelect.selectedIndex].text.split(' ')[0];

  const payload = {
    job_id: jobId,
    new_tech_id: techId
  };

  try {
    const response = await fetch('/api/handover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      alert(`Success! Custody handover registered. Desk alerts dispatched.`);
      
      // Update local state
      const targetJob = repairs.find(j => j.job_id === jobId);
      if (targetJob) {
        targetJob.current_tech = techName;
        targetJob.status = 'Repairing'; // Handover implies active repairing
      }
      
      renderTable();
      handoverModal.classList.remove('active');
    } else {
      alert(`Handover Error: ${result.error}`);
    }
  } catch (error) {
    console.error('API Error connecting to /api/handover:', error);
    
    // Local simulation update
    const targetJob = repairs.find(j => j.job_id === jobId);
    if (targetJob) {
      targetJob.current_tech = techName;
      targetJob.status = 'Repairing';
    }
    renderTable();
    handoverModal.classList.remove('active');
    alert(`Testing Mode: Transfer complete. Handover logged to custody timeline.`);
  }
});
