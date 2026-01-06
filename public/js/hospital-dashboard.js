// Hospital Dashboard JavaScript
requireAuth();

const user = getCurrentUser();
let medicineCount = 0;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    if (!user || user.role !== 'hospital') {
        window.location.href = '/hospital/login.html';
        return;
    }

    const hospitalNameEl = document.getElementById('hospitalName');
    if (hospitalNameEl) {
        hospitalNameEl.textContent = user.hospitalName || user.name || 'Hospital';
    }

    loadDashboard();
    setupForms();
    
    // Load emergency patient selects after a short delay to ensure DOM is ready
    setTimeout(() => {
        loadEmergencyPatientSelects();
    }, 500);
});

// Switch tabs
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const tabContent = document.getElementById(tabName + 'Tab');
    if (tabContent) {
        tabContent.classList.add('active');
    }

    // Activate clicked tab button
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find tab button by onclick attribute
        const tabButtons = document.querySelectorAll('.tab');
        tabButtons.forEach(btn => {
            if (btn.getAttribute('onclick') === `switchTab('${tabName}')`) {
                btn.classList.add('active');
            }
        });
    }

    // Load tab content
    if (tabName === 'emergency') {
        loadEmergencyPatients();
    } else if (tabName === 'patient-info') {
        loadAccessiblePatients();
    } else if (tabName === 'report') {
        loadMedicalReports();
    }
}

// Load dashboard data
async function loadDashboard() {
    try {
        const response = await apiRequest('/hospital/dashboard');
        if (!response) return;
        
        const data = await response.json();
        
        renderPrescriptionsTodayCount(data.prescriptionsTodayCount || 0);
        renderAdmittedPatients(data.admittedPatients || []);
        renderPendingConsents(data.pendingConsents || []);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Render prescriptions created today count
function renderPrescriptionsTodayCount(count) {
    const container = document.getElementById('prescriptionsTodayCount');
    container.innerHTML = `
        <div style="font-size: 3rem; font-weight: bold; color: var(--primary-color);">${count}</div>
        <div style="font-size: 1rem; color: var(--text-secondary); margin-top: 0.5rem;">Prescriptions</div>
    `;
}

// Render admitted patients (legacy)
function renderAdmittedPatients(patients) {
    const container = document.getElementById('admittedPatients');
    if (!container) return;
    
    if (patients.length === 0) {
        container.innerHTML = '<li class="empty-state">No admitted patients</li>';
        return;
    }

    container.innerHTML = patients.slice(0, 5).map(patient => {
        // Privacy-safe: Show only admission ID and date - NO patient name/phone
        const date = new Date(patient.admissionDate).toLocaleDateString();
        const admissionId = patient._id ? patient._id.toString().slice(-6) : 'N/A';
        return `
            <li class="card-list-item">
                <strong>Admission #${admissionId}</strong>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Admitted: ${date}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                    Status: ${patient.isActive ? 'Active' : 'Discharged'}
                </div>
            </li>
        `;
    }).join('');
}

// Render emergency patients (for overview)
function renderEmergencyPatients(patients) {
    // This can be used in overview if needed
    // For now, emergency patients are shown in their dedicated tab
}

// Render pending consents
function renderPendingConsents(consents) {
    const container = document.getElementById('pendingConsents');
    
    if (consents.length === 0) {
        container.innerHTML = '<li class="empty-state">No pending requests</li>';
        return;
    }

    container.innerHTML = consents.slice(0, 5).map(consent => {
        const date = new Date(consent.requestedAt).toLocaleDateString();
        return `
            <li class="card-list-item">
                <strong>${consent.patientName}</strong> - ${consent.patientPhone}
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Requested: ${date}</div>
            </li>
        `;
    }).join('');
}

// Setup forms
function setupForms() {
    // Prescription form
    const prescriptionForm = document.getElementById('prescriptionForm');
    if (prescriptionForm) {
        prescriptionForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const medicines = [];
            document.querySelectorAll('.medicine-item').forEach(item => {
                medicines.push({
                    name: item.querySelector('[name="medicineName"]').value,
                    dosage: item.querySelector('[name="medicineDosage"]').value,
                    timing: item.querySelector('[name="medicineTiming"]').value,
                    duration: parseInt(item.querySelector('[name="medicineDuration"]').value)
                });
            });

            if (medicines.length === 0) {
                alert('Please add at least one medicine');
                return;
            }

            const prescriptionType = document.querySelector('input[name="prescriptionType"]:checked')?.value;
            if (!prescriptionType) {
                alert('Please select prescription type');
                return;
            }

            const prescriptionData = {
                medicines,
                notes: document.getElementById('prescriptionNotes').value || ''
            };

            // Add patient info based on type
            if (prescriptionType === 'emergency') {
                const emergencyPatientId = document.getElementById('emergencyPatientId').value;
                if (!emergencyPatientId) {
                    alert('Please select an emergency patient');
                    return;
                }
                prescriptionData.emergencyPatientId = emergencyPatientId;
                prescriptionData.patientName = document.getElementById('patientName').value || 'Emergency Patient';
            } else {
                const patientName = document.getElementById('patientName').value;
                const patientPhone = document.getElementById('patientPhone').value;
                if (!patientName || !patientPhone) {
                    alert('Please enter patient name and phone number');
                    return;
                }
                prescriptionData.patientName = patientName;
                prescriptionData.patientPhone = patientPhone;
            }

            try {
                const response = await apiRequest('/hospital/prescriptions', {
                    method: 'POST',
                    body: JSON.stringify(prescriptionData)
                });

                if (response && response.ok) {
                    alert('Prescription created successfully!');
                    prescriptionForm.reset();
                    document.getElementById('medicinesList').innerHTML = '';
                    medicineCount = 0;
                    loadDashboard();
                } else {
                    const data = await response.json();
                    alert(data.message || data.errors?.map(e => e.msg).join(', ') || 'Error creating prescription');
                }
            } catch (error) {
                console.error('Error creating prescription:', error);
                alert('Error creating prescription');
            }
        });
    }

// Load medical reports (read-only)
async function loadMedicalReports() {
    const container = document.getElementById('medicalReportsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const response = await apiRequest('/hospital/reports');
        if (!response) return;

        const data = await response.json();
        
        if (data.reports.length === 0) {
            container.innerHTML = '<div class="empty-state">No reports available</div>';
            return;
        }

        container.innerHTML = data.reports.map(report => {
            const date = new Date(report.date).toLocaleDateString();
            return `
                <div style="margin-bottom: 1.5rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                        <div>
                            <h3 style="margin: 0 0 0.5rem 0;">${report.reportName}</h3>
                            <p style="color: var(--text-secondary); margin: 0;">
                                ${report.reportType} ${report.uploadedBy === 'lab' ? `- Uploaded by ${report.labName || 'Lab'}` : ''}
                            </p>
                            <small style="color: var(--text-secondary);">${date}</small>
                        </div>
                    </div>
                    ${report.description ? `<p style="margin-top: 0.5rem; color: var(--text-secondary);">${report.description}</p>` : ''}
                    <p style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-muted);">
                        <strong>Note:</strong> Patient personal information is hidden for privacy
                    </p>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading reports:', error);
        container.innerHTML = '<div class="error-message">Error loading reports</div>';
    }
}

    // Emergency patient form
    const emergencyPatientForm = document.getElementById('emergencyPatientForm');
    if (emergencyPatientForm) {
        emergencyPatientForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const bedNumber = document.getElementById('bedNumber').value;
            if (!bedNumber || !bedNumber.trim()) {
                alert('Please enter a bed number');
                return;
            }

            const emergencyData = {
                bedNumber: bedNumber.trim(),
                notes: document.getElementById('emergencyNotes').value || ''
            };

            try {
                const response = await apiRequest('/hospital/emergency-patients', {
                    method: 'POST',
                    body: JSON.stringify(emergencyData)
                });

                if (response && response.ok) {
                    const data = await response.json();
                    alert(`Emergency patient admitted successfully! Temporary ID: ${data.emergencyPatient.temporaryId}`);
                    emergencyPatientForm.reset();
                    loadEmergencyPatients();
                    loadEmergencyPatientSelects(); // Refresh selects in prescription/report forms
                    loadDashboard();
                } else {
                    const data = await response.json();
                    alert(data.message || 'Error admitting emergency patient');
                }
            } catch (error) {
                console.error('Error admitting emergency patient:', error);
                alert('Error admitting emergency patient');
            }
        });
    }

    // Consent request form
    const consentRequestForm = document.getElementById('consentRequestForm');
    if (consentRequestForm) {
        consentRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const consentData = {
                patientName: document.getElementById('consentPatientName').value,
                patientPhone: document.getElementById('consentPatientPhone').value
            };

            if (!consentData.patientName || !consentData.patientPhone) {
                alert('Please enter patient name and phone number');
                return;
            }

            try {
                const response = await apiRequest('/hospital/consent/request', {
                    method: 'POST',
                    body: JSON.stringify(consentData)
                });

                if (response && response.ok) {
                    alert('Consent request sent successfully!');
                    consentRequestForm.reset();
                    loadDashboard();
                } else {
                    const data = await response.json();
                    alert(data.message || 'Error sending consent request');
                }
            } catch (error) {
                console.error('Error sending consent request:', error);
                alert('Error sending consent request');
            }
        });
    }

    // Admit form (legacy - for regular admissions)
    const admitForm = document.getElementById('admitForm');
    if (admitForm) {
        admitForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const admitData = {
                patientName: document.getElementById('admitPatientName').value,
                patientPhone: document.getElementById('admitPatientPhone').value,
                notes: document.getElementById('admitNotes').value || ''
            };

            if (!admitData.patientName || !admitData.patientPhone) {
                alert('Please enter patient name and phone number');
                return;
            }

            try {
                const response = await apiRequest('/hospital/admissions', {
                    method: 'POST',
                    body: JSON.stringify(admitData)
                });

            if (response && response.ok) {
                alert('Patient admitted successfully!');
                closeAdmitModal();
                loadDashboard(); // Dashboard will show admitted patients in overview
            } else {
                    const data = await response.json();
                    alert(data.message || 'Error admitting patient');
                }
            } catch (error) {
                console.error('Error admitting patient:', error);
                alert('Error admitting patient');
            }
        });
    }
}

// Add medicine field
function addMedicine() {
    const container = document.getElementById('medicinesList');
    const medicineHtml = `
        <div class="medicine-item" id="medicine-${medicineCount}">
            <div class="medicine-item-header">
                <h4>Medicine ${medicineCount + 1}</h4>
                <button type="button" class="btn-remove" onclick="removeMedicine(${medicineCount})">Remove</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Medicine Name</label>
                    <input type="text" name="medicineName" required>
                </div>
                <div class="form-group">
                    <label>Dosage</label>
                    <input type="text" name="medicineDosage" placeholder="e.g., 500mg" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Timing</label>
                    <input type="text" name="medicineTiming" placeholder="e.g., morning, 9:00 AM, after food" required>
                </div>
                <div class="form-group">
                    <label>Duration (days)</label>
                    <input type="number" name="medicineDuration" min="1" required>
                </div>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', medicineHtml);
    medicineCount++;
}

// Remove medicine field
function removeMedicine(id) {
    document.getElementById(`medicine-${id}`).remove();
}

// Show admit modal
function showAdmitModal() {
    document.getElementById('admitModal').classList.add('active');
}

// Close admit modal
function closeAdmitModal() {
    document.getElementById('admitModal').classList.remove('active');
    document.getElementById('admitForm').reset();
}

// Load admissions (legacy - for regular admissions if needed)
async function loadAdmissions() {
    const container = document.getElementById('admissionsList');
    if (!container) return; // Element doesn't exist in current HTML - emergency patients are used instead
    
    container.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const response = await apiRequest('/hospital/admissions?active=true');
        if (!response) return;
        
        const data = await response.json();
        
        if (data.admissions && data.admissions.length === 0) {
            container.innerHTML = '<div class="empty-state">No admitted patients</div>';
            return;
        }

        container.innerHTML = (data.admissions || []).map(admission => {
            const date = new Date(admission.admissionDate).toLocaleDateString();
            return `
                <div style="margin-bottom: 1rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3>${admission.patientName || 'Unknown'}</h3>
                        <p style="color: var(--text-secondary);">${admission.patientPhone || 'N/A'}</p>
                        <small style="color: var(--text-secondary);">Admitted: ${date}</small>
                        ${admission.notes ? `<p style="margin-top: 0.5rem;">${admission.notes}</p>` : ''}
                    </div>
                    <button onclick="dischargePatient('${admission._id}')" class="btn-danger">Discharge</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading admissions:', error);
        if (container) {
            container.innerHTML = '<div class="error-message">Error loading admissions</div>';
        }
    }
}

// Discharge patient
async function dischargePatient(id) {
    if (!confirm('Are you sure you want to discharge this patient?')) return;

    try {
        const response = await apiRequest(`/hospital/admissions/${id}/discharge`, {
            method: 'PUT'
        });
        
        if (response && response.ok) {
            alert('Patient discharged successfully');
            loadAdmissions();
            loadDashboard();
        }
    } catch (error) {
        alert('Error discharging patient');
    }
}

// Load accessible patients
async function loadAccessiblePatients() {
    const container = document.getElementById('accessiblePatients');
    container.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const response = await apiRequest('/hospital/consents');
        if (!response) return;
        
        const data = await response.json();
        
        const grantedConsents = data.consents.filter(c => c.status === 'granted');
        
        if (grantedConsents.length === 0) {
            container.innerHTML = '<div class="empty-state">No accessible patients</div>';
            return;
        }

        container.innerHTML = grantedConsents.map(consent => {
            return `
                <div style="margin-bottom: 1rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3>${consent.patientName}</h3>
                        <p style="color: var(--text-secondary);">${consent.patientPhone}</p>
                    </div>
                    <button onclick="viewPatientInfo('${consent.patientId}')" class="btn-primary">View Info</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<div class="error-message">Error loading accessible patients</div>';
    }
}

// View patient info (with temporary access - can be revoked)
async function viewPatientInfo(patientId) {
    const modal = document.getElementById('patientInfoModal');
    const content = document.getElementById('patientInfoContent');
    modal.classList.add('active');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const response = await apiRequest(`/hospital/patient-info/${patientId}`);
        if (!response) return;
        
        const data = await response.json();
        
        content.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid var(--border-color);">
                    <div>
                        <h3>${data.patient.name}</h3>
                        <p style="color: var(--text-secondary);">${data.patient.phone}</p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button onclick="showAddPrescriptionModal('${patientId}')" class="btn-primary">Add Prescription</button>
                        ${data.consentId ? `<button onclick="revokePatientAccess('${data.consentId}')" class="btn-secondary">OK (Revoke Access)</button>` : ''}
                    </div>
                </div>
                
                <h4 style="margin-top: 1rem;">Prescriptions (Editable)</h4>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">
                    You can add and update prescriptions for this patient. Medical history reports are read-only.
                </p>
                ${data.prescriptions.length === 0 
                    ? '<p style="color: var(--text-secondary);">No prescriptions</p>'
                    : data.prescriptions.map(p => {
                        const date = new Date(p.date).toLocaleDateString();
                        return `
                            <div style="margin: 1rem 0; padding: 1rem; background: var(--light-bg); border-radius: 8px;">
                                <div style="display: flex; justify-content: space-between; align-items: start;">
                                    <div style="flex: 1;">
                                        <strong>Dr. ${p.doctorName}</strong> - ${date}<br>
                                        <small style="color: var(--text-secondary);">${p.medicines.map(m => `${m.name} (${m.dosage}, ${m.timing || 'Auto'})`).join(', ')}</small>
                                        ${p.notes ? `<p style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">${p.notes}</p>` : ''}
                                    </div>
                                    <button onclick="editPrescription('${p._id}')" class="btn-secondary" style="margin-left: 1rem; white-space: nowrap;">Edit</button>
                                </div>
                            </div>
                        `;
                    }).join('')
                }
                
                <h4 style="margin-top: 2rem;">Medical History (Read-only)</h4>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">
                    Historical medical reports cannot be edited.
                </p>
                ${data.reports.length === 0 
                    ? '<p style="color: var(--text-secondary);">No reports</p>'
                    : data.reports.map(r => {
                        const date = new Date(r.date).toLocaleDateString();
                        const uploadedBy = r.uploadedBy === 'lab' ? ` (Lab: ${r.labName || 'Unknown'})` : ` (Hospital: ${r.hospitalName || 'Unknown'})`;
                        return `
                            <div style="margin: 1rem 0; padding: 1rem; background: var(--light-bg); border-radius: 8px; opacity: 0.9;">
                                <strong>${r.reportName}</strong> - ${r.reportType}${uploadedBy}<br>
                                <small style="color: var(--text-secondary);">${date}</small>
                                ${r.description ? `<p style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">${r.description}</p>` : ''}
                            </div>
                        `;
                    }).join('')
                }
            </div>
        `;
    } catch (error) {
        console.error('Error loading patient info:', error);
        content.innerHTML = '<div class="error-message">Error loading patient info</div>';
    }
}

// Close patient info modal
function closePatientInfoModal() {
    document.getElementById('patientInfoModal').classList.remove('active');
}

// Revoke patient access (OK button)
async function revokePatientAccess(consentId) {
    if (!consentId) {
        alert('No active consent to revoke');
        return;
    }

    if (!confirm('Are you sure you want to revoke access? You will need to request access again to view this patient\'s information.')) {
        return;
    }

    try {
        const response = await apiRequest(`/hospital/consent/${consentId}/revoke`, {
            method: 'PUT'
        });

        if (response && response.ok) {
            alert('Access revoked successfully. Patient information is now hidden.');
            closePatientInfoModal();
            loadAccessiblePatients(); // Refresh accessible patients list
        } else {
            const data = await response.json();
            alert(data.message || 'Error revoking access');
        }
    } catch (error) {
        console.error('Error revoking access:', error);
        alert('Error revoking access');
    }
}

// Show add prescription modal for patient
function showAddPrescriptionModal(patientId) {
    // Store patient ID for prescription creation
    window.currentPatientIdForPrescription = patientId;
    
    // Switch to prescription tab and pre-fill patient info
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelector('[onclick="switchTab(\'prescription\')"]').classList.add('active');
    document.getElementById('prescriptionTab').classList.add('active');
    
    // Set regular patient type
    document.querySelector('input[name="prescriptionType"][value="regular"]').checked = true;
    togglePrescriptionType();
    
    // Pre-fill patient info (if we have it)
    fetchPatientInfoForPrescription(patientId);
    
    // Close patient info modal
    closePatientInfoModal();
}

// Fetch patient info to pre-fill prescription form
async function fetchPatientInfoForPrescription(patientId) {
    try {
        const response = await apiRequest(`/hospital/patient-info/${patientId}`);
        if (!response) return;
        
        const data = await response.json();
        
        // Pre-fill form
        document.getElementById('patientName').value = data.patient.name;
        document.getElementById('patientPhone').value = data.patient.phone;
    } catch (error) {
        console.error('Error fetching patient info:', error);
    }
}

// Edit prescription
function editPrescription(prescriptionId) {
    alert('Edit prescription feature - Load prescription data and show edit form');
    // TODO: Implement edit prescription modal/form
}

// ==================== EMERGENCY PATIENT FUNCTIONS ====================

// Load emergency patients
async function loadEmergencyPatients() {
    const container = document.getElementById('emergencyPatientsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const response = await apiRequest('/hospital/emergency-patients?active=true');
        if (!response) return;
        
        const data = await response.json();
        
        if (data.emergencyPatients.length === 0) {
            container.innerHTML = '<div class="empty-state">No active emergency patients</div>';
            return;
        }

        container.innerHTML = data.emergencyPatients.map(patient => {
            const date = new Date(patient.admissionDate).toLocaleDateString();
            return `
                <div style="margin-bottom: 1rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <div>
                            <h3>Bed ${patient.bedNumber}</h3>
                            <p style="color: var(--text-secondary);"><strong>Temp ID:</strong> ${patient.temporaryId}</p>
                            <small style="color: var(--text-secondary);">Admitted: ${date}</small>
                            ${patient.notes ? `<p style="margin-top: 0.5rem;">${patient.notes}</p>` : ''}
                        </div>
                        <button onclick="dischargeEmergencyPatient('${patient._id}')" class="btn-danger">Discharge</button>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="viewEmergencyPatient('${patient._id}')" class="btn-secondary">View Details</button>
                        <button onclick="selectEmergencyPatientForPrescription('${patient._id}', '${patient.temporaryId}', 'Bed ${patient.bedNumber}')" class="btn-primary">Create Prescription</button>
                        <button onclick="selectEmergencyPatientForReport('${patient._id}', '${patient.temporaryId}', 'Bed ${patient.bedNumber}')" class="btn-primary">Upload Report</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Also update selects when loading
        loadEmergencyPatientSelects();
    } catch (error) {
        console.error('Error loading emergency patients:', error);
        container.innerHTML = '<div class="error-message">Error loading emergency patients</div>';
    }
}

// Discharge emergency patient
async function dischargeEmergencyPatient(id) {
    if (!confirm('Are you sure you want to discharge this emergency patient?')) return;

    try {
        const response = await apiRequest(`/hospital/emergency-patients/${id}/discharge`, {
            method: 'PUT'
        });
        
        if (response && response.ok) {
            alert('Emergency patient discharged successfully');
            loadEmergencyPatients();
            loadEmergencyPatientSelects();
            loadDashboard();
        }
    } catch (error) {
        console.error('Error discharging emergency patient:', error);
        alert('Error discharging emergency patient');
    }
}

// Load emergency patient selects (for prescription/report forms)
async function loadEmergencyPatientSelects() {
    try {
        const response = await apiRequest('/hospital/emergency-patients?active=true');
        if (!response) return;
        
        const data = await response.json();
        const activePatients = data.emergencyPatients.filter(p => p.isActive);
        
        // Update prescription select
        const prescriptionSelect = document.getElementById('emergencyPatientSelect');
        if (prescriptionSelect) {
            prescriptionSelect.innerHTML = '<option value="">Select Emergency Patient...</option>' +
                activePatients.map(p => `<option value="${p._id}">Bed ${p.bedNumber} - ${p.temporaryId}</option>`).join('');
        }
        
        // Update report select
        const reportSelect = document.getElementById('emergencyReportPatientSelect');
        if (reportSelect) {
            reportSelect.innerHTML = '<option value="">Select Emergency Patient...</option>' +
                activePatients.map(p => `<option value="${p._id}">Bed ${p.bedNumber} - ${p.temporaryId}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading emergency patient selects:', error);
    }
}

// Toggle prescription type (regular vs emergency)
function togglePrescriptionType() {
    const type = document.querySelector('input[name="prescriptionType"]:checked').value;
    const regularFields = document.getElementById('regularPatientFields');
    const emergencyFields = document.getElementById('emergencyPatientFields');
    const nameInput = document.getElementById('patientName');
    const phoneInput = document.getElementById('patientPhone');
    
    if (type === 'emergency') {
        regularFields.style.display = 'none';
        emergencyFields.style.display = 'block';
        nameInput.removeAttribute('required');
        phoneInput.removeAttribute('required');
        loadEmergencyPatientSelects();
    } else {
        regularFields.style.display = 'block';
        emergencyFields.style.display = 'none';
        nameInput.setAttribute('required', 'required');
        phoneInput.setAttribute('required', 'required');
        document.getElementById('emergencyPatientId').value = '';
        document.getElementById('patientName').value = '';
    }
}

// Toggle report type (regular vs emergency)
function toggleReportType() {
    const type = document.querySelector('input[name="reportType"]:checked').value;
    const regularFields = document.getElementById('regularReportFields');
    const emergencyFields = document.getElementById('emergencyReportFields');
    const nameInput = document.getElementById('reportPatientName');
    const phoneInput = document.getElementById('reportPatientPhone');
    
    if (type === 'emergency') {
        regularFields.style.display = 'none';
        emergencyFields.style.display = 'block';
        nameInput.removeAttribute('required');
        phoneInput.removeAttribute('required');
        loadEmergencyPatientSelects();
    } else {
        regularFields.style.display = 'block';
        emergencyFields.style.display = 'none';
        nameInput.setAttribute('required', 'required');
        phoneInput.setAttribute('required', 'required');
        document.getElementById('emergencyReportPatientId').value = '';
        document.getElementById('reportPatientName').value = '';
    }
}

// Load emergency patient name for prescription form
function loadEmergencyPatientName() {
    const select = document.getElementById('emergencyPatientSelect');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption.value) {
        document.getElementById('emergencyPatientId').value = selectedOption.value;
        document.getElementById('patientName').value = selectedOption.text;
    } else {
        document.getElementById('emergencyPatientId').value = '';
        document.getElementById('patientName').value = '';
    }
}

// Load emergency patient name for report form
function loadEmergencyReportPatientName() {
    const select = document.getElementById('emergencyReportPatientSelect');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption.value) {
        document.getElementById('emergencyReportPatientId').value = selectedOption.value;
        document.getElementById('reportPatientName').value = selectedOption.text;
    } else {
        document.getElementById('emergencyReportPatientId').value = '';
        document.getElementById('reportPatientName').value = '';
    }
}

// Select emergency patient for prescription (from emergency patients list)
function selectEmergencyPatientForPrescription(id, tempId, bedInfo) {
    // Switch to prescription tab
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelector('[onclick="switchTab(\'prescription\')"]').classList.add('active');
    document.getElementById('prescriptionTab').classList.add('active');
    
    // Set emergency patient type
    document.querySelector('input[name="prescriptionType"][value="emergency"]').checked = true;
    togglePrescriptionType();
    
    // Select the patient
    document.getElementById('emergencyPatientSelect').value = id;
    loadEmergencyPatientName();
}

// Select emergency patient for report (from emergency patients list)
function selectEmergencyPatientForReport(id, tempId, bedInfo) {
    // Create a simple modal for report upload
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Upload Report for Bed ${bedInfo}</h2>
                <button class="btn-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <form id="emergencyReportUploadForm" style="padding: 1.5rem;">
                <div class="form-group">
                    <label>Report Type</label>
                    <select id="emergencyReportType" required>
                        <option value="">Select Report Type</option>
                        <option value="Blood Test">Blood Test</option>
                        <option value="X-Ray">X-Ray</option>
                        <option value="MRI">MRI</option>
                        <option value="CT Scan">CT Scan</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Report Name</label>
                    <input type="text" id="emergencyReportName" placeholder="e.g., Complete Blood Count" required>
                </div>
                <div class="form-group">
                    <label>Description (Optional)</label>
                    <textarea id="emergencyReportDescription" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label>Report File</label>
                    <input type="file" id="emergencyReportFile" accept="image/*,application/pdf,.doc,.docx" required>
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button type="submit" class="btn-primary">Upload Report</button>
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    const form = document.getElementById('emergencyReportUploadForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const reportType = document.getElementById('emergencyReportType').value;
        const reportName = document.getElementById('emergencyReportName').value;
        const description = document.getElementById('emergencyReportDescription').value || '';
        const fileInput = document.getElementById('emergencyReportFile');
        
        if (!reportType || !reportName || !fileInput.files[0]) {
            alert('Please fill in all required fields');
            return;
        }
        
        const formData = new FormData();
        formData.append('report', fileInput.files[0]);
        formData.append('reportType', reportType);
        formData.append('reportName', reportName);
        formData.append('description', description);
        
        try {
            const token = getToken();
            if (!token) {
                alert('You are not authenticated. Please login again.');
                if (typeof logout === 'function') {
                    logout();
                }
                return;
            }

            const response = await fetch(`/api/hospital/emergency-patients/${id}/reports`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                    // Don't set Content-Type for FormData - browser will set it automatically with boundary
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('Report uploaded successfully!');
                modal.remove();
                loadEmergencyPatients();
            } else {
                alert(data.message || data.errors?.map(e => e.msg).join(', ') || 'Error uploading report');
            }
        } catch (error) {
            console.error('Error uploading report:', error);
            alert('Error uploading report. Please try again.');
        }
    });
}

// View emergency patient details
async function viewEmergencyPatient(id) {
    try {
        const response = await apiRequest(`/hospital/emergency-patients/${id}`);
        if (!response) return;
        
        const data = await response.json();
        const patient = data.emergencyPatient;
        const prescriptions = data.prescriptions || [];
        const reports = data.reports || [];
        
        const modal = document.getElementById('patientInfoModal');
        const content = document.getElementById('patientInfoContent');
        modal.classList.add('active');
        
        content.innerHTML = `
            <div>
                <h3>Emergency Patient - Bed ${patient.bedNumber}</h3>
                <p><strong>Temporary ID:</strong> ${patient.temporaryId}</p>
                <p><strong>Admitted:</strong> ${new Date(patient.admissionDate).toLocaleDateString()}</p>
                ${patient.notes ? `<p><strong>Notes:</strong> ${patient.notes}</p>` : ''}
                
                <h4 style="margin-top: 2rem;">Prescriptions (${prescriptions.length})</h4>
                ${prescriptions.length === 0 
                    ? '<p>No prescriptions</p>'
                    : prescriptions.map(p => {
                        const date = new Date(p.date).toLocaleDateString();
                        return `
                            <div style="margin: 1rem 0; padding: 1rem; background: var(--light-bg); border-radius: 8px;">
                                <strong>Dr. ${p.doctorName}</strong> - ${date}<br>
                                <small>${p.medicines.map(m => m.name).join(', ')}</small>
                            </div>
                        `;
                    }).join('')
                }
                
                <h4 style="margin-top: 2rem;">Medical Reports (${reports.length})</h4>
                ${reports.length === 0 
                    ? '<p>No reports</p>'
                    : reports.map(r => {
                        const date = new Date(r.date).toLocaleDateString();
                        return `
                            <div style="margin: 1rem 0; padding: 1rem; background: var(--light-bg); border-radius: 8px;">
                                <strong>${r.reportName}</strong> - ${r.reportType}<br>
                                <small>${date}</small>
                            </div>
                        `;
                    }).join('')
                }
            </div>
        `;
    } catch (error) {
        console.error('Error loading emergency patient:', error);
        alert('Error loading emergency patient details');
    }
}

// Initialize emergency patient selects on load (already handled in main DOMContentLoaded)

