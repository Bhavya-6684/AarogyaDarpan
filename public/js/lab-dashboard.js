// Lab Dashboard JavaScript

// Check authentication
if (typeof requireAuth === 'function') {
    requireAuth();
}

// Get current user
const user = getCurrentUser();
if (user && user.role !== 'lab') {
    if (typeof logout === 'function') {
        logout();
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (typeof requireAuth === 'function') {
        requireAuth();
    }

    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'lab') {
        if (typeof logout === 'function') {
            logout();
        }
        return;
    }

    // Display lab name
    const labNameEl = document.getElementById('labName');
    if (labNameEl) {
        labNameEl.textContent = currentUser.name || 'Lab';
    }

    // Setup report form
    const reportForm = document.getElementById('reportForm');
    if (reportForm) {
        reportForm.addEventListener('submit', handleReportSubmit);
    }

    // Load reports if on reports tab
    const reportsTab = document.getElementById('reportsTab');
    if (reportsTab && reportsTab.classList.contains('active')) {
        loadReports();
    }
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
    if (tabName === 'reports') {
        loadReports();
    }
}

// Handle report form submission
async function handleReportSubmit(e) {
    e.preventDefault();

    const reportFile = document.getElementById('reportFile').files[0];
    if (!reportFile) {
        alert('Please select a report file');
        return;
    }

    const hospitalName = document.getElementById('hospitalName').value;
    const patientName = document.getElementById('patientName').value;
    const patientPhone = document.getElementById('patientPhone').value;
    const reportType = document.getElementById('reportType').value;
    const reportName = document.getElementById('reportName').value;

    if (!hospitalName || !patientName || !patientPhone || !reportType || !reportName) {
        alert('Please fill in all required fields');
        return;
    }

    const formData = new FormData();
    formData.append('report', reportFile);
    formData.append('hospitalName', hospitalName);
    formData.append('patientName', patientName);
    formData.append('patientPhone', patientPhone);
    formData.append('reportType', reportType);
    formData.append('reportName', reportName);
    formData.append('description', document.getElementById('reportDescription').value || '');

    try {
        const token = getToken();
        if (!token) {
            alert('You are not authenticated. Please login again.');
            if (typeof logout === 'function') {
                logout();
            }
            return;
        }

        const response = await fetch('/api/lab/reports', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            alert('Report uploaded successfully!');
            document.getElementById('reportForm').reset();
            loadReports();
        } else {
            const errorMsg = data.errors ? data.errors.map(e => e.msg).join(', ') : (data.message || 'Error uploading report');
            alert(errorMsg);
        }
    } catch (error) {
        console.error('Error uploading report:', error);
        alert('Error uploading report. Please try again.');
    }
}

// Load all reports
async function loadReports() {
    const container = document.getElementById('reportsList');
    container.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const response = await apiRequest('/lab/reports');
        if (!response) return;

        const data = await response.json();
        
        if (data.reports.length === 0) {
            container.innerHTML = '<div class="empty-state">No reports uploaded yet</div>';
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
                                ${report.reportType} - ${report.patientName} (${report.patientPhone})
                            </p>
                            <small style="color: var(--text-secondary);">${date}</small>
                        </div>
                    </div>
                    ${report.description ? `<p style="margin-top: 0.5rem; color: var(--text-secondary);">${report.description}</p>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading reports:', error);
        container.innerHTML = '<div class="error-message">Error loading reports</div>';
    }
}

