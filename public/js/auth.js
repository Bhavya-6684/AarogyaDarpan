// Auth utility functions
const API_BASE = '/api';

// Get auth token from localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Get current user from localStorage
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Check if user is authenticated
function isAuthenticated() {
    return !!getToken();
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        const user = getCurrentUser();
        if (user && user.role === 'patient') {
            window.location.href = '/patient/login.html';
        } else if (user && user.role === 'hospital') {
            window.location.href = '/hospital/login.html';
        } else if (user && user.role === 'lab') {
            window.location.href = '/lab/login.html';
        } else {
            window.location.href = '/';
        }
    }
}

// Make authenticated API request
async function apiRequest(url, options = {}) {
    const token = getToken();
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };

    const response = await fetch(API_BASE + url, {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        requireAuth();
        return null;
    }

    return response;
}

// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

