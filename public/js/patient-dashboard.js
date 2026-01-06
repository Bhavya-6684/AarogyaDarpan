// Patient Dashboard JavaScript
requireAuth();

const user = getCurrentUser();
let currentFamilyMemberId = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    if (!user || user.role !== 'patient') {
        window.location.href = '/patient/login.html';
        return;
    }

    document.getElementById('userName').textContent = user.name || 'User';
    updateProfileImage();
    loadDashboard();
    loadFamilyMembers();
    setupAddMemberForm();
});

// Update profile image
function updateProfileImage() {
    const profileImg = document.getElementById('profileImg');
    if (user.profilePhoto) {
        profileImg.src = `/${user.profilePhoto}`;
    }
}

// Toggle profile menu
document.getElementById('profileButton').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('profileMenu');
    menu.classList.toggle('active');
});

document.addEventListener('click', () => {
    document.getElementById('profileMenu').classList.remove('active');
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
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');

    // Update current family member ID before loading
    currentFamilyMemberId = document.getElementById('familyMemberSelect')?.value || null;
    
    // Load tab content
    if (tabName === 'prescriptions') {
        loadAllPrescriptions();
    } else if (tabName === 'reports') {
        loadAllReports();
    } else if (tabName === 'reminders') {
        loadAllReminders();
    } else if (tabName === 'family') {
        loadFamilyMembers();
    }
}

// Load dashboard data
async function loadDashboard() {
    currentFamilyMemberId = document.getElementById('familyMemberSelect')?.value || null;
    const queryParam = currentFamilyMemberId ? `?familyMemberId=${currentFamilyMemberId}` : '';

    try {
        const response = await apiRequest(`/patient/dashboard${queryParam}`);
        if (!response) return;
        
        const data = await response.json();
        
        renderUpcomingReminders(data.reminders || []);
        renderRecentPrescriptions(data.prescriptions || []);
        renderRecentReports(data.reports || []);
        renderNotifications(data.notifications || []);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Render upcoming reminders
function renderUpcomingReminders(reminders) {
    const container = document.getElementById('upcomingReminders');
    
    if (reminders.length === 0) {
        container.innerHTML = '<li class="empty-state">No upcoming reminders</li>';
        return;
    }

    container.innerHTML = reminders.slice(0, 5).map(reminder => {
        const time = reminder.reminderTime || 'N/A';
        return `
            <li class="card-list-item">
                <strong>${reminder.medicineName}</strong> - ${reminder.dosage}
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Time: ${time}</div>
            </li>
        `;
    }).join('');
}

// Render recent prescriptions
function renderRecentPrescriptions(prescriptions) {
    const container = document.getElementById('recentPrescriptions');
    
    if (prescriptions.length === 0) {
        container.innerHTML = '<li class="empty-state">No prescriptions</li>';
        return;
    }

    container.innerHTML = prescriptions.slice(0, 5).map(prescription => {
        const date = new Date(prescription.date).toLocaleDateString();
        return `
            <li class="card-list-item">
                <strong>Dr. ${prescription.doctorName}</strong> - ${prescription.hospitalName}
                <div style="font-size: 0.875rem; color: var(--text-secondary);">${date}</div>
            </li>
        `;
    }).join('');
}

// Render recent reports
function renderRecentReports(reports) {
    const container = document.getElementById('recentReports');
    
    if (reports.length === 0) {
        container.innerHTML = '<li class="empty-state">No reports</li>';
        return;
    }

    container.innerHTML = reports.slice(0, 5).map(report => {
        const date = new Date(report.date).toLocaleDateString();
        return `
            <li class="card-list-item">
                <strong>${report.reportName}</strong> - ${report.reportType}
                <div style="font-size: 0.875rem; color: var(--text-secondary);">${date}</div>
            </li>
        `;
    }).join('');
}

// Render notifications (with consent request handling)
function renderNotifications(notifications) {
    const container = document.getElementById('notifications');
    
    if (notifications.length === 0) {
        container.innerHTML = '<li class="empty-state">No new notifications</li>';
        return;
    }

    container.innerHTML = notifications.map(notification => {
        // Check if this is a consent request notification
        if (notification.type === 'consent_request' && notification.relatedId) {
            return `
                <li class="card-list-item" style="padding: 1rem; background: var(--warning-bg, #fff3cd); border-left: 4px solid var(--warning-color, #ffc107); margin-bottom: 0.5rem;">
                    <strong>${notification.title}</strong>
                    <div style="font-size: 0.875rem; color: var(--text-secondary); margin: 0.5rem 0;">${notification.message}</div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                        <button onclick="handleConsentRequest('${notification.relatedId}', 'grant')" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.875rem;">Allow</button>
                        <button onclick="handleConsentRequest('${notification.relatedId}', 'deny')" class="btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.875rem;">Deny</button>
                    </div>
                </li>
            `;
        }
        
        // Regular notification
        return `
            <li class="card-list-item">
                <strong>${notification.title}</strong>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">${notification.message}</div>
            </li>
        `;
    }).join('');
}

// Handle consent request (Allow/Deny)
async function handleConsentRequest(consentId, action) {
    if (!confirm(`Are you sure you want to ${action === 'grant' ? 'allow' : 'deny'} this access request?`)) {
        return;
    }

    try {
        const response = await apiRequest(`/patient/consent/${consentId}/respond`, {
            method: 'POST',
            body: JSON.stringify({ action })
        });

        if (response && response.ok) {
            alert(`Access request ${action === 'grant' ? 'approved' : 'denied'} successfully.`);
            loadDashboard(); // Reload to update notifications
        } else {
            const data = await response.json();
            alert(data.message || `Error ${action === 'grant' ? 'approving' : 'denying'} request`);
        }
    } catch (error) {
        console.error('Error handling consent request:', error);
        alert('Error processing request');
    }
}

// Load all prescriptions
async function loadAllPrescriptions() {
    const container = document.getElementById('allPrescriptions');
    container.innerHTML = '<div class="loading">Loading...</div>';

    const queryParam = currentFamilyMemberId ? `?familyMemberId=${currentFamilyMemberId}` : '';

    try {
        const response = await apiRequest(`/patient/prescriptions${queryParam}`);
        if (!response) return;
        
        const data = await response.json();
        
        if (data.prescriptions.length === 0) {
            container.innerHTML = '<div class="empty-state">No prescriptions found</div>';
            return;
        }

        container.innerHTML = data.prescriptions.map(prescription => {
            const date = new Date(prescription.date).toLocaleDateString();
            const medicines = prescription.medicines.map(med => 
                `<div style="margin: 0.5rem 0; padding: 0.75rem; background: var(--light-bg); border-radius: 8px;">
                    <strong>${med.name}</strong> - ${med.dosage}<br>
                    <small>Timing: ${med.timing}, Duration: ${med.duration} days</small>
                </div>`
            ).join('');

            return `
                <div style="margin-bottom: 2rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                        <div>
                            <h3>Dr. ${prescription.doctorName}</h3>
                            <p style="color: var(--text-secondary);">${prescription.hospitalName}</p>
                        </div>
                        <div class="badge badge-info">${date}</div>
                    </div>
                    <div>
                        <h4>Medicines:</h4>
                        ${medicines}
                    </div>
                    ${prescription.notes ? `<p style="margin-top: 1rem;"><strong>Notes:</strong> ${prescription.notes}</p>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<div class="error-message">Error loading prescriptions</div>';
    }
}

// Load all reports
async function loadAllReports() {
    const container = document.getElementById('allReports');
    container.innerHTML = '<div class="loading">Loading...</div>';

    const queryParam = currentFamilyMemberId ? `?familyMemberId=${currentFamilyMemberId}` : '';

    try {
        const response = await apiRequest(`/patient/reports${queryParam}`);
        if (!response) return;
        
        const data = await response.json();
        
        if (data.reports.length === 0) {
            container.innerHTML = '<div class="empty-state">No reports found</div>';
            return;
        }

        container.innerHTML = data.reports.map(report => {
            const date = new Date(report.date).toLocaleDateString();
            return `
                <div style="margin-bottom: 1rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3>${report.reportName}</h3>
                        <p style="color: var(--text-secondary);">${report.reportType} - ${report.hospitalName}</p>
                        <small style="color: var(--text-secondary);">${date}</small>
                        ${report.description ? `<p style="margin-top: 0.5rem;">${report.description}</p>` : ''}
                    </div>
                    <a href="/api/patient/reports/${report._id}/download" class="btn-primary" download>Download</a>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<div class="error-message">Error loading reports</div>';
    }
}

// Load all reminders
async function loadAllReminders() {
    const container = document.getElementById('allReminders');
    container.innerHTML = '<div class="loading">Loading...</div>';

    const queryParam = currentFamilyMemberId ? `?familyMemberId=${currentFamilyMemberId}` : '';

    try {
        const response = await apiRequest(`/patient/reminders${queryParam}`);
        if (!response) return;
        
        const data = await response.json();
        
        if (data.reminders.length === 0) {
            container.innerHTML = '<div class="empty-state">No reminders found</div>';
            return;
        }

        container.innerHTML = data.reminders.map(reminder => {
            const startDate = new Date(reminder.startDate).toLocaleDateString();
            const endDate = new Date(reminder.endDate).toLocaleDateString();
            const statusBadge = reminder.completed 
                ? '<span class="badge badge-success">Completed</span>'
                : reminder.isActive 
                    ? '<span class="badge badge-info">Active</span>'
                    : '<span class="badge badge-warning">Inactive</span>';

            return `
                <div style="margin-bottom: 1rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <div>
                            <h3>${reminder.medicineName}</h3>
                            <p style="color: var(--text-secondary);">${reminder.dosage}</p>
                        </div>
                        ${statusBadge}
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <p><strong>Time:</strong> ${reminder.reminderTime}</p>
                        <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
                    </div>
                    ${!reminder.completed ? `
                        <button onclick="toggleReminder('${reminder._id}', ${!reminder.isActive})" class="btn-secondary">
                            ${reminder.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onclick="completeReminder('${reminder._id}')" class="btn-primary" style="margin-left: 0.5rem;">
                            Mark Complete
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<div class="error-message">Error loading reminders</div>';
    }
}

// Toggle reminder
async function toggleReminder(id, activate) {
    try {
        const response = await apiRequest(`/reminders/${id}/toggle`, {
            method: 'PUT'
        });
        
        if (response && response.ok) {
            loadAllReminders();
        }
    } catch (error) {
        alert('Error updating reminder');
    }
}

// Complete reminder
async function completeReminder(id) {
    try {
        const response = await apiRequest(`/reminders/${id}/complete`, {
            method: 'PUT'
        });
        
        if (response && response.ok) {
            loadAllReminders();
        }
    } catch (error) {
        alert('Error completing reminder');
    }
}

// Load family members
async function loadFamilyMembers() {
    const container = document.getElementById('familyMembers');
    if (container) {
        container.innerHTML = '<div class="loading">Loading...</div>';
    }

    const selector = document.getElementById('familyMemberSelect');
    const selectorContainer = document.getElementById('familyMemberSelector');
    
    try {
        const response = await apiRequest('/patient/family-members');
        if (!response) return;
        
        const data = await response.json();
        
        // Update selector
        if (selector) {
            selector.innerHTML = '<option value="">Myself</option>' +
                data.members.map(member => 
                    `<option value="${member._id}">${member.name} (${member.relationship})</option>`
                ).join('');
            
            // Show selector if there are family members
            if (data.members.length > 0 && selectorContainer) {
                selectorContainer.classList.remove('hidden');
            }
        }

        // Render in family tab
        if (container) {
            if (data.members.length === 0) {
                container.innerHTML = '<div class="empty-state">No family members added yet</div>';
                return;
            }

            container.innerHTML = data.members.map(member => {
                return `
                    <div style="margin-bottom: 1rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3>${member.name}</h3>
                            <p style="color: var(--text-secondary);">${member.relationship} - ${member.age} years old, ${member.gender}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        if (container) {
            container.innerHTML = '<div class="error-message">Error loading family members</div>';
        }
    }
}

// Show add member modal
function showAddMemberModal() {
    document.getElementById('addMemberModal').classList.add('active');
}

// Close add member modal
function closeAddMemberModal() {
    document.getElementById('addMemberModal').classList.remove('active');
    document.getElementById('addMemberForm').reset();
}

// Setup add member form
function setupAddMemberForm() {
    document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const memberData = {
            name: document.getElementById('memberName').value,
            age: parseInt(document.getElementById('memberAge').value),
            gender: document.getElementById('memberGender').value,
            relationship: document.getElementById('memberRelationship').value
        };

        try {
            const response = await apiRequest('/patient/family-members', {
                method: 'POST',
                body: JSON.stringify(memberData)
            });

            if (response && response.ok) {
                closeAddMemberModal();
                loadFamilyMembers();
            } else {
                const data = await response.json();
                alert(data.message || 'Error adding family member');
            }
        } catch (error) {
            alert('Error adding family member');
        }
    });
}

// Chatbot functions
function toggleChatbot() {
    document.getElementById('chatbotWindow').classList.toggle('active');
}

async function sendChatMessage() {
    const input = document.getElementById('chatbotInput');
    const message = input.value.trim();
    
    if (!message) return;

    // Add user message
    const messagesDiv = document.getElementById('chatbotMessages');
    messagesDiv.innerHTML += `<div class="chat-message user">${message}</div>`;
    input.value = '';
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const response = await apiRequest('/chatbot/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });

        if (response) {
            const data = await response.json();
            messagesDiv.innerHTML += `<div class="chat-message bot">${data.response}</div>`;
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    } catch (error) {
        messagesDiv.innerHTML += `<div class="chat-message bot">Sorry, I encountered an error. Please try again.</div>`;
    }
}

