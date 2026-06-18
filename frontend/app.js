const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
   ? "http://localhost:8000" 
   : "https://calisthenics-tracker-ebon.vercel.app"; // 
let isLoggedIn = localStorage.getItem("is_logged_in") === "true"; 

// ---- DOM ELEMENTS ----
const authWrapper = document.getElementById("auth-wrapper");
const selectionScreen = document.getElementById("selection-screen");
const appContainer = document.getElementById("app-container");

const landingScreen = document.getElementById("landing-screen");
const startTrackingBtn = document.getElementById("start-tracking-btn");

const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authBtn = document.getElementById("auth-btn");
const emailGroup = document.getElementById("email-group");
const authToggleLink = document.getElementById("auth-toggle-link");
const authToggleMsg = document.getElementById("auth-toggle-msg");
const logoutBtn = document.getElementById("logout-btn");
const homeLogo = document.getElementById("home-logo");

// Profile Dropdown Elements
const profileBtn = document.getElementById("profile-btn");
const profileName = document.getElementById("profile-name");
const profileDropdown = document.getElementById("profile-dropdown");

const splits = document.querySelectorAll(".split");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

let isLoginMode = true;

// ---- TOAST NOTIFICATION ENGINE ----
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerText = message;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
}

// ---- 1. AUTH TOGGLE MECHANISM ----
authToggleLink.addEventListener("click", (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    
    if (isLoginMode) {
        authTitle.innerText = "SIGN IN";
        authBtn.innerText = "ENTER";
        emailGroup.classList.add("hidden");
        authToggleMsg.innerText = "NEW HERE?";
        authToggleLink.innerText = "CREATE ACCOUNT";
    } else {
        authTitle.innerText = "CREATE ACCOUNT";
        authBtn.innerText = "JOIN";
        emailGroup.classList.remove("hidden");
        authToggleMsg.innerText = "ALREADY MEMBER?";
        authToggleLink.innerText = "SIGN IN";
    }
});

// ---- 2. AUTHENTICATION API CALLS ----
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("auth-username").value;
    const password = document.getElementById("auth-password").value;
    
    if (isLoginMode) {
        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error("SYSTEM LOCKDOWN: Too many attempts. Try again in 60s.");
                }
                throw new Error("Invalid credentials");
            }
            
            const data = await response.json();
            
            localStorage.setItem("is_logged_in", "true");
            isLoggedIn = true;
            localStorage.setItem("is_admin", data.is_admin);
            
            // Save username and update UI
            const displayName = (data.username || "USER").toUpperCase();
            localStorage.setItem("username", displayName);
            if(profileName) profileName.innerText = displayName;
            if(logoutBtn) logoutBtn.innerText = "LOGOUT"; 
            
            if (data.is_admin && document.getElementById("admin-nav-btn")) {
                document.getElementById("admin-nav-btn").classList.remove("hidden");
            }
            
            showToast("Welcome back.", "success");
            openDashboard("history-page"); // Instantly skip to dashboard
        } catch (err) {
            showToast(err.message, "error");
        }
    } else {
        const email = document.getElementById("auth-email").value;
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password })
            });

            if (!response.ok) throw new Error("Registration failed");
            
            showToast("Account created. Please sign in.", "success");
            isLoginMode = true;
            authToggleLink.click();
        } catch (err) {
            showToast(err.message, "error");
        }
    }
});

// ---- 2.5 GOOGLE SSO INTEGRATION ----
async function handleGoogleLogin(response) {
    try {
        const res = await fetch(`${API_URL}/auth/google`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: response.credential })
        });

        if (!res.ok) throw new Error("Google authentication failed");
        
        const data = await res.json();
        
        localStorage.setItem("is_logged_in", "true");
        isLoggedIn = true;
        localStorage.setItem("is_admin", data.is_admin);
        
        // Save username and update UI
        const displayName = (data.username || "USER").toUpperCase();
        localStorage.setItem("username", displayName);
        if(profileName) profileName.innerText = displayName;
        if(logoutBtn) logoutBtn.innerText = "LOGOUT"; 
        
        if (data.is_admin && document.getElementById("admin-nav-btn")) {
            document.getElementById("admin-nav-btn").classList.remove("hidden");
        }
        
        showToast("Welcome back via Google.", "success");
        openDashboard("history-page"); // Instantly skip to dashboard
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ---- PROFILE MENU LOGIC ----
if (profileBtn) {
    profileBtn.addEventListener("click", (e) => {
        e.stopPropagation(); 
        if (profileDropdown) profileDropdown.classList.toggle("hidden");
    });
}

document.addEventListener("click", (e) => {
    // Handle Profile Dropdown clicking away
    if (!e.target.closest(".profile-widget")) {
        if (profileDropdown && !profileDropdown.classList.contains("hidden")) {
            profileDropdown.classList.add("hidden");
        }
    }
    
    // Handle Custom Exercise Dropdown
    if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.dropdown-options').forEach(menu => menu.classList.remove('show'));
    }

    if (e.target.classList.contains('dropdown-selected')) {
        const menu = e.target.nextElementSibling;
        menu.classList.toggle('show');
    }
});

// ---- 3. SPLIT SCREEN SELECTION ----
splits.forEach(split => {
    split.addEventListener("click", () => {
        const targetTab = split.getAttribute("data-target");
        openDashboard(targetTab);
    });
});

homeLogo.addEventListener("click", () => {
    window.history.pushState({ page: "selection" }, "", "#selection");
    showSelectionScreen();
});

// Catch the browser's back/forward button clicks natively
window.addEventListener("popstate", (e) => {
    if (e.state && e.state.page) {
        if (e.state.page === "landing") {
            showLandingScreen();
        } else if (e.state.page === "selection") {
            showSelectionScreen();
        } else {
            openDashboard(e.state.page);
        }
    } else {
        // Default fallback
        isLoggedIn ? openDashboard("history-page") : showLandingScreen();
    }
});

// ---- 4. TAB NAVIGATION INTERFACE ----
function openDashboard(targetPage) {
    landingScreen.classList.add("hidden");
    selectionScreen.classList.add("hidden");
    authWrapper.classList.add("hidden"); // <--- THE MISSING FIX
    appContainer.classList.remove("hidden");
    
    // Inject clean URL path
    window.history.pushState({ page: targetPage }, "", `#${targetPage}`);
    
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.add("hidden"));
    
    const activeTabButton = document.querySelector(`[data-tab="${targetPage}"]`);
    const activeSection = document.getElementById(targetPage);
    
    if (activeTabButton) activeTabButton.classList.add("active");
    if (activeSection) activeSection.classList.remove("hidden");
    
    if (targetPage === "calisthenics-page") loadExercises("Calisthenics");
    if (targetPage === "gym-page") loadExercises("Gym");
    if (targetPage === "history-page") {
        loadWorkoutHistory();
        renderAnalyticsChart(); 
    }
}
tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        openDashboard(btn.getAttribute("data-tab"));
    });
});

// ---- 5. LOGOUT / SIGN IN HANDLING ----
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        if (!isLoggedIn) {
            // Guest clicking "SIGN IN" -> Send them to the login screen
            appContainer.classList.add("hidden");
            selectionScreen.classList.add("hidden");
            landingScreen.classList.add("hidden");
            authWrapper.classList.remove("hidden");
            if (profileDropdown) profileDropdown.classList.add("hidden");
            return;
        }

        // Authenticated user logging out -> Downgrade them to Guest instantly
        localStorage.removeItem("is_logged_in");
        localStorage.removeItem("is_admin"); 
        localStorage.removeItem("username"); 
        isLoggedIn = false;
        
        // Update the UI text
        logoutBtn.innerText = "SIGN IN"; 
        if (profileName) profileName.innerText = "GUEST";
        
        // Hide the dropdown menu and admin button
        if (profileDropdown) profileDropdown.classList.add("hidden");
        if (document.getElementById("admin-nav-btn")) {
            document.getElementById("admin-nav-btn").classList.add("hidden");
        }
        
        // Redraw dashboard as guest
        loadWorkoutHistory();
        renderAnalyticsChart();
        
        showToast("Logged out. You are now browsing as a Guest.", "info"); 
    });
}

// ---- 7. DATA LOADING AND LOGGING ----
async function loadExercises(type) {
    const activeTab = document.querySelector('.tab-content:not(.hidden)');
    if (!activeTab) return;
    
    const dropdownOptions = activeTab.querySelector('.dropdown-options');
    const   dropdownSelected = activeTab.querySelector('.dropdown-selected');
    const hiddenInput = activeTab.querySelector('.exercise-input');
    
    if (!dropdownOptions) return;

    dropdownSelected.innerText = `SELECT ${type.toUpperCase()} EXERCISE...`;
    dropdownSelected.classList.remove("has-value");
    if(hiddenInput) hiddenInput.value = "";

    try {
        const response = await fetch(`${API_URL}/exercises?type=${type}`, { credentials: "include" });
        const exercises = await response.json();
        
        // 1. Group exercises by their category field dynamically
        const grouped = {};
        exercises.forEach(ex => {
            const cat = ex.category.toUpperCase();
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(ex);
        });

        // 2. Build structured HTML with non-clickable category sub-headers
        let htmlContent = "";
        for (const category in grouped) {
            htmlContent += `<div class="dropdown-category-header" style="padding: 8px 12px; color: #666; font-size: 11px; font-weight: 700; background: #16161a; letter-spacing: 1px;">— ${category} —</div>`;
            
            grouped[category].forEach(ex => {
                htmlContent += `<div class="dropdown-option" data-value="${ex.id}" style="padding-left: 20px;">${ex.name.toUpperCase()}</div>`;
            });
        }
        
        dropdownOptions.innerHTML = htmlContent;

        // 3. Re-wire the click listeners only to the actual selectable options
        const options = dropdownOptions.querySelectorAll('.dropdown-option');
        options.forEach(option => {
            option.addEventListener("click", () => {
                dropdownSelected.innerText = option.innerText;
                dropdownSelected.classList.add("has-value");
                hiddenInput.value = option.getAttribute("data-value");
                dropdownOptions.classList.remove("show");
            });
        });
    } catch (err) { console.error(err); }
}

async function loadWorkoutHistory() {
   const tableBody = document.getElementById("history-table-body");
    try {
        let logs = [];
        
        if (isLoggedIn) {
            const response = await fetch(`${API_URL}/logs`, { credentials: "include" });
            logs = await response.json();
        } else {
            logs = JSON.parse(localStorage.getItem("guest_logs") || "[]").sort((a, b) => b.id - a.id);
        }
        
        tableBody.innerHTML = logs.map(log => `
            <tr>
                <td style="color:#666;">${isLoggedIn ? log.date.split(" ")[0] : log.date.split("T")[0]}</td>
                <td style="color:#fff;">${log.exercise_name.toUpperCase()}</td>
                <td style="color:#666;">${log.workout_type.toUpperCase()}</td>
                <td>${log.sets}</td>
                <td>${log.reps}</td>
                <td>${log.weight_added > 0 ? log.weight_added + ' KG' : '—'}</td>
                <td style="text-align: right;">
                    <button class="btn-delete" data-id="${log.id}">✕</button>
                </td>
            </tr>
        `).join("");
    } catch (err) { console.error(err); }
}

// ---- 7.5 CUSTOM MODAL DELETE LOGIC ----
const confirmModal = document.getElementById("confirm-modal");
const modalConfirmBtn = document.getElementById("modal-confirm-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
let pendingDeleteId = null;

const historyTableBody = document.getElementById("history-table-body");
if (historyTableBody) {
    historyTableBody.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-delete")) {
            pendingDeleteId = e.target.getAttribute("data-id");
            confirmModal.classList.remove("hidden"); 
        }
    });
}

if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", () => {
        confirmModal.classList.add("hidden");
        pendingDeleteId = null;
    });
}

if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener("click", async () => {
        if (!pendingDeleteId) return;
        
        confirmModal.classList.add("hidden"); 
        
        try {
            if (isLoggedIn) {
                const response = await fetch(`${API_URL}/logs/${pendingDeleteId}`, {
                    method: "DELETE",
                    credentials: "include"
                });
                if (!response.ok) throw new Error("Could not delete log");
            } else {
                let guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
                guestLogs = guestLogs.filter(log => log.id.toString() !== pendingDeleteId.toString());
                localStorage.setItem("guest_logs", JSON.stringify(guestLogs));
            }
            
            showToast("SET DELETED", "info");
            loadWorkoutHistory();
            renderAnalyticsChart();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            pendingDeleteId = null; 
        }
    });
}

// ---- 8. ANALYTICS CHART ENGINE ----
let volumeChartInstance = null;

async function renderAnalyticsChart() {
  const chartCanvas = document.getElementById('volumeChart');
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    
    try {
        let chartLabels = [];
        let chartData = [];

        if (isLoggedIn) {
            const response = await fetch(`${API_URL}/analytics`, { credentials: "include" });
            if (!response.ok) throw new Error("Could not fetch analytics data");
            const data = await response.json();
            chartLabels = data.labels;
            chartData = data.volume;
        } else {
            // Guest Mode: Padded 7-Day Chart Fix
            const guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
            const volumeMap = {};
            
            guestLogs.forEach(log => {
                const date = log.date.split("T")[0];
                const weight = log.weight_added > 0 ? log.weight_added : 1;
                const vol = log.sets * log.reps * weight;
                volumeMap[date] = (volumeMap[date] || 0) + vol;
            });

            chartLabels = [];
            chartData = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const dateStr = d.toISOString().split("T")[0];
                chartLabels.push(dateStr);
                chartData.push(volumeMap[dateStr] || 0); 
            }
        }

        if (volumeChartInstance) {
            volumeChartInstance.destroy();
        }

        volumeChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'TOTAL VOLUME',
                    data: chartData,
                    borderColor: '#ffffff',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderWidth: 2,
                    pointBackgroundColor: '#ffffff',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#666', font: { family: 'Montserrat', weight: '600', size: 10 }, beginAtZero: true },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#666', font: { family: 'Montserrat', weight: '600', size: 10 } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#121215',
                        titleFont: { family: 'Montserrat', weight: '700' },
                        bodyFont: { family: 'Montserrat', weight: '600' },
                        displayColors: false,
                        borderColor: '#333',
                        borderWidth: 1
                    }
                }
            }
        });
    } catch (err) { 
        console.error("Error building Chart.js:", err); 
    }
}

// ---- WORKOUT SUBMISSION ----
document.querySelectorAll(".workout-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const selectedText = form.querySelector(".dropdown-selected");
        const defaultType = form.getAttribute("data-type");
        
        const exerciseId = form.querySelector(".exercise-input").value;
        const sets = form.querySelector(".input-sets").value;
        const reps = form.querySelector(".input-reps").value;
        const weightAdded = form.querySelector(".input-weight").value || 0;
        
        if (!exerciseId) {
            showToast("PLEASE SELECT AN EXERCISE", "error");
            return;
        }
        
       try {
            if (isLoggedIn) {
                const response = await fetch(`${API_URL}/logs`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        exercise_id: parseInt(exerciseId),
                        sets: parseInt(sets),
                        reps: parseInt(reps),
                        weight_added: parseFloat(weightAdded)
                    })
                });
                if (!response.ok) throw new Error("Failed to log set");
            } else {
                const guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
                guestLogs.push({
                    id: Date.now(), 
                    exercise_name: selectedText.innerText.replace("SELECT ", "").replace(" EXERCISE...", ""),
                    workout_type: defaultType,
                    sets: parseInt(sets),
                    reps: parseInt(reps),
                    weight_added: parseFloat(weightAdded),
                    date: new Date().toISOString()
                });
                localStorage.setItem("guest_logs", JSON.stringify(guestLogs));
            }
            
            showToast(isLoggedIn ? "SET LOGGED" : "GUEST SET LOGGED", "success");
            form.reset();
            
            selectedText.innerText = `SELECT ${defaultType.toUpperCase()} EXERCISE...`;
            selectedText.classList.remove("has-value");
            form.querySelector(".exercise-input").value = "";

            // Auto-Refresh Dashboard
            loadWorkoutHistory();
            renderAnalyticsChart();

        } catch (err) { 
            showToast(err.message, "error"); 
        }
    });
});

// ---- 9. SECURE ADMIN LOGIC ----
const adminForm = document.getElementById("admin-exercise-form");

if (adminForm) {
    adminForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const payload = {
            name: document.getElementById("admin-ex-name").value,
            category: document.getElementById("admin-ex-category").value,
            workout_type: document.getElementById("admin-ex-type").value
        };

        try {
            const response = await fetch(`${API_URL}/exercises`, {
                method: "POST",
                credentials: "include", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Injection failed");
            }

            showToast(`SYSTEM OVERRIDE: ${payload.name} INJECTED`, "success");
            adminForm.reset();
            
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

// ---- INITIALIZATION FLOW ----
function showLandingScreen() {
    landingScreen.classList.remove("hidden");
    authWrapper.classList.add("hidden");
    appContainer.classList.add("hidden");
    selectionScreen.classList.add("hidden");
    window.history.pushState({ page: "landing" }, "", "/");
}

function showSelectionScreen() {
    landingScreen.classList.add("hidden");
    authWrapper.classList.add("hidden");
    appContainer.classList.add("hidden");
    selectionScreen.classList.remove("hidden");
}

// Hook up the new big entrance button
if (startTrackingBtn) {
    startTrackingBtn.addEventListener("click", () => {
        window.history.pushState({ page: "selection" }, "", "#selection");
        showSelectionScreen();
    });
}

async function verifySession() {
    try {
        const response = await fetch(`${API_URL}/logs`, { credentials: "include" });
        if (response.status === 401) {
            localStorage.removeItem("is_logged_in");
            localStorage.removeItem("is_admin");
            localStorage.removeItem("username");
            isLoggedIn = false;
            
            if(logoutBtn) logoutBtn.innerText = "SIGN IN";
            if(profileName) profileName.innerText = "GUEST";
            if(document.getElementById("admin-nav-btn")) {
                document.getElementById("admin-nav-btn").classList.add("hidden");
            }
            
            showToast("Session expired. You are now browsing as a Guest.", "info");
        } else {
            // Re-verify valid UI states
            if(logoutBtn) logoutBtn.innerText = "LOGOUT";
            if(profileName) profileName.innerText = localStorage.getItem("username") || "USER";
            if (localStorage.getItem("is_admin") === "true" && document.getElementById("admin-nav-btn")) {
                document.getElementById("admin-nav-btn").classList.remove("hidden");
            }
        }
    } catch (err) {
        console.error("Could not verify session with server.");
    }
}

// ---- OPTIMISTIC BOOT SEQUENCE ----
const currentHash = window.location.hash.replace("#", "");
const validTabs = ["calisthenics-page", "gym-page", "history-page"];

if (isLoggedIn) {
    if(logoutBtn) logoutBtn.innerText = "LOGOUT";
    if(profileName) profileName.innerText = localStorage.getItem("username") || "USER";
    
    if (localStorage.getItem("is_admin") === "true" && document.getElementById("admin-nav-btn")) {
        document.getElementById("admin-nav-btn").classList.remove("hidden");
    }
    
    // Check URL: Restore their specific tab, or default to history
    const targetTab = validTabs.includes(currentHash) ? currentHash : "history-page";
    openDashboard(targetTab); 
    
    verifySession(); 
} else {
    if(logoutBtn) logoutBtn.innerText = "SIGN IN";
    if(profileName) profileName.innerText = "GUEST";
    
    // Check URL: If a guest refreshes while logging a set, keep them on that tab
    if (validTabs.includes(currentHash)) {
        openDashboard(currentHash);
    } else {
        // Otherwise, show the big APEX Entrance Page
        showLandingScreen(); 
    }
}