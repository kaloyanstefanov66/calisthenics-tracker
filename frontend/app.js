const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
   ? "http://localhost:8000"
   : "https://calisthenics-tracker-ebon.vercel.app";

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

// ---- FIX #4: FORMAT ISO DATE TO "Jun 14" ----
function formatDate(dateStr) {
    // Append time to avoid UTC offset shifting the date by one day
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
                if (response.status === 429) throw new Error("SYSTEM LOCKDOWN: Too many attempts. Try again in 60s.");
                throw new Error("Invalid credentials");
            }
            const data = await response.json();
            localStorage.setItem("is_logged_in", "true");
            isLoggedIn = true;
            localStorage.setItem("is_admin", data.is_admin);
            const displayName = (data.username || "USER").toUpperCase();
            localStorage.setItem("username", displayName);
            if (profileName) profileName.innerText = displayName;
            if (logoutBtn) logoutBtn.innerText = "LOGOUT";
            if (data.is_admin && document.getElementById("admin-nav-btn")) {
                document.getElementById("admin-nav-btn").classList.remove("hidden");
            }
            showToast("Welcome back.", "success");
            openDashboard("history-page");
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

// ---- 2.5 GOOGLE SSO ----
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
        const displayName = (data.username || "USER").toUpperCase();
        localStorage.setItem("username", displayName);
        if (profileName) profileName.innerText = displayName;
        if (logoutBtn) logoutBtn.innerText = "LOGOUT";
        if (data.is_admin && document.getElementById("admin-nav-btn")) {
            document.getElementById("admin-nav-btn").classList.remove("hidden");
        }
        showToast("Welcome back via Google.", "success");
        openDashboard("history-page");
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
    if (!e.target.closest(".profile-widget")) {
        if (profileDropdown && !profileDropdown.classList.contains("hidden")) {
            profileDropdown.classList.add("hidden");
        }
    }
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

window.addEventListener("popstate", (e) => {
    if (e.state && e.state.page) {
        if (e.state.page === "landing") showLandingScreen();
        else if (e.state.page === "selection") showSelectionScreen();
        else openDashboard(e.state.page);
    } else {
        isLoggedIn ? openDashboard("history-page") : showLandingScreen();
    }
});

// ---- 4. TAB NAVIGATION ----
function openDashboard(targetPage) {
    landingScreen.classList.add("hidden");
    selectionScreen.classList.add("hidden");
    authWrapper.classList.add("hidden");
    appContainer.classList.remove("hidden");
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
    btn.addEventListener("click", () => openDashboard(btn.getAttribute("data-tab")));
});

// ---- 5. LOGOUT / SIGN IN ----
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        if (!isLoggedIn) {
            appContainer.classList.add("hidden");
            selectionScreen.classList.add("hidden");
            landingScreen.classList.add("hidden");
            authWrapper.classList.remove("hidden");
            if (profileDropdown) profileDropdown.classList.add("hidden");
            return;
        }
        localStorage.removeItem("is_logged_in");
        localStorage.removeItem("is_admin");
        localStorage.removeItem("username");
        isLoggedIn = false;
        logoutBtn.innerText = "SIGN IN";
        if (profileName) profileName.innerText = "GUEST";
        if (profileDropdown) profileDropdown.classList.add("hidden");
        if (document.getElementById("admin-nav-btn")) {
            document.getElementById("admin-nav-btn").classList.add("hidden");
        }
        loadWorkoutHistory();
        renderAnalyticsChart();
        showToast("Logged out. You are now browsing as a Guest.", "info");
    });
}

// ---- FIX #5: LAST WEIGHT MEMORY PER EXERCISE ----
function saveLastWeight(exerciseId, weight) {
    if (!exerciseId || parseFloat(weight) <= 0) return;
    const weights = JSON.parse(localStorage.getItem("last_weights") || "{}");
    weights[exerciseId] = weight;
    localStorage.setItem("last_weights", JSON.stringify(weights));
}

function getLastWeight(exerciseId) {
    const weights = JSON.parse(localStorage.getItem("last_weights") || "{}");
    return weights[exerciseId] || "";
}

// ---- 7. DATA LOADING AND LOGGING ----
async function loadExercises(type) {
    const activeTab = document.querySelector('.tab-content:not(.hidden)');
    if (!activeTab) return;
    const dropdownOptions = activeTab.querySelector('.dropdown-options');
    const dropdownSelected = activeTab.querySelector('.dropdown-selected');
    const hiddenInput = activeTab.querySelector('.exercise-input');
    const weightInput = activeTab.querySelector('.input-weight');
    if (!dropdownOptions) return;

    // FIX #3: Show loading state in dropdown while API call is in flight
    dropdownSelected.innerText = `LOADING...`;
    dropdownSelected.classList.remove("has-value");
    if (hiddenInput) hiddenInput.value = "";

    try {
        const response = await fetch(`${API_URL}/exercises?type=${type}`, { credentials: "include" });
        if (!response.ok) throw new Error("Could not load exercises");
        const exercises = await response.json();

        // Reset to placeholder after successful load
        dropdownSelected.innerText = `SELECT ${type.toUpperCase()} EXERCISE...`;

        const grouped = {};
        exercises.forEach(ex => {
            const cat = ex.category.toUpperCase();
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(ex);
        });

        let htmlContent = "";
        for (const category in grouped) {
            htmlContent += `<div class="dropdown-category-header" style="padding: 8px 12px; color: #666; font-size: 11px; font-weight: 700; background: #16161a; letter-spacing: 1px;">— ${category} —</div>`;
            grouped[category].forEach(ex => {
                htmlContent += `<div class="dropdown-option" data-value="${ex.id}" data-name="${ex.name.toUpperCase()}" style="padding-left: 20px;">${ex.name.toUpperCase()}</div>`;
            });
        }

        dropdownOptions.innerHTML = htmlContent;

        const options = dropdownOptions.querySelectorAll('.dropdown-option');
        options.forEach(option => {
            option.addEventListener("click", () => {
                dropdownSelected.innerText = option.innerText;
                dropdownSelected.classList.add("has-value");
                hiddenInput.value = option.getAttribute("data-value");
                hiddenInput.dataset.name = option.getAttribute("data-name");
                dropdownOptions.classList.remove("show");

                // FIX #5: Pre-fill weight input with last used weight for this exercise
                if (weightInput) {
                    const lastWeight = getLastWeight(option.getAttribute("data-value"));
                    weightInput.value = lastWeight;
                }
            });
        });
    } catch (err) {
        dropdownSelected.innerText = `SELECT ${type.toUpperCase()} EXERCISE...`;
        showToast("Could not load exercises. Check your connection.", "error");
        console.error(err);
    }
}

async function loadWorkoutHistory() {
    const tableBody = document.getElementById("history-table-body");
    try {
        let logs = [];
        if (isLoggedIn) {
            // FIX #8: Add ?limit=50 explicitly (avoids loading all rows just for session verify)
            const response = await fetch(`${API_URL}/logs?limit=50`, { credentials: "include" });
            if (!response.ok) throw new Error("Could not load history");
            logs = await response.json();
        } else {
            // FIX #7: Cap guest logs at last 200 entries to avoid localStorage overflow
            const allGuestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
            if (allGuestLogs.length > 200) {
                const trimmed = allGuestLogs.slice(-200);
                localStorage.setItem("guest_logs", JSON.stringify(trimmed));
                logs = trimmed.sort((a, b) => b.id - a.id);
            } else {
                logs = allGuestLogs.sort((a, b) => b.id - a.id);
            }
        }

        if (logs.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: #444; padding: 40px 0; font-size: 13px; letter-spacing: 1px;">
                        NO SETS LOGGED YET — PICK AN EXERCISE ABOVE TO GET STARTED
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = logs.map(log => `
            <tr>
                <td style="color:#666;">${formatDate(isLoggedIn ? log.date.split(" ")[0] : log.date.split("T")[0])}</td>
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
    } catch (err) {
        showToast("Could not load training history.", "error");
        console.error(err);
    }
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
            // FIX #4: Format ISO dates to "Jun 14" instead of "2026-06-14"
            chartLabels = data.labels.map(d => formatDate(d));
            chartData = data.volume;
        } else {
            const guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
            const volumeMap = {};
            guestLogs.forEach(log => {
                const date = log.date.split("T")[0];
                const weight = log.weight_added > 0 ? log.weight_added : 1;
                const vol = log.sets * log.reps * weight;
                volumeMap[date] = (volumeMap[date] || 0) + vol;
            });
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const dateStr = d.toISOString().split("T")[0];
                // FIX #4: Format guest chart labels too
                chartLabels.push(formatDate(dateStr));
                chartData.push(volumeMap[dateStr] || 0);
            }
        }

        if (volumeChartInstance) volumeChartInstance.destroy();

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
        showToast("Could not load analytics chart.", "error");
        console.error("Error building Chart.js:", err);
    }
}

// ---- WORKOUT SUBMISSION ----
document.querySelectorAll(".workout-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const defaultType = form.getAttribute("data-type");
        const exerciseInput = form.querySelector(".exercise-input");
        const exerciseId = exerciseInput.value;
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
                const exerciseName = exerciseInput.dataset.name || exerciseId;
                const allGuestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
                allGuestLogs.push({
                    id: Date.now(),
                    exercise_name: exerciseName,
                    workout_type: defaultType,
                    sets: parseInt(sets),
                    reps: parseInt(reps),
                    weight_added: parseFloat(weightAdded),
                    date: new Date().toISOString()
                });
                // FIX #7: Enforce 200-entry cap on every write, not just on read
                if (allGuestLogs.length > 200) allGuestLogs.splice(0, allGuestLogs.length - 200);
                localStorage.setItem("guest_logs", JSON.stringify(allGuestLogs));
            }

            // FIX #5: Save last used weight for this exercise
            saveLastWeight(exerciseId, weightAdded);

            showToast(isLoggedIn ? "SET LOGGED" : "GUEST SET LOGGED", "success");

            // Reset form but keep exercise selected and weight pre-filled
            const currentExerciseId = exerciseInput.value;
            const currentExerciseName = exerciseInput.dataset.name;
            const currentDropdownText = form.querySelector(".dropdown-selected").innerText;
            form.reset();

            // Restore exercise selection state so user can quickly log another set
            form.querySelector(".dropdown-selected").innerText = currentDropdownText;
            form.querySelector(".dropdown-selected").classList.add("has-value");
            exerciseInput.value = currentExerciseId;
            exerciseInput.dataset.name = currentExerciseName;

            // FIX #5: Re-fill weight with what they just used
            if (parseFloat(weightAdded) > 0) {
                form.querySelector(".input-weight").value = weightAdded;
            }

            loadWorkoutHistory();
            renderAnalyticsChart();
        } catch (err) {
            showToast(err.message, "error");
        }
    });
});

// ---- 9. ADMIN LOGIC ----
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

// ---- SCREEN HELPERS ----
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

if (startTrackingBtn) {
    startTrackingBtn.addEventListener("click", () => {
        window.history.pushState({ page: "selection" }, "", "#selection");
        showSelectionScreen();
    });
}

// FIX #8: Lightweight session verify — only fetch 1 log row instead of 50
async function verifySession() {
    try {
        const response = await fetch(`${API_URL}/logs?limit=1`, { credentials: "include" });
        if (response.status === 401) {
            localStorage.removeItem("is_logged_in");
            localStorage.removeItem("is_admin");
            localStorage.removeItem("username");
            isLoggedIn = false;
            if (logoutBtn) logoutBtn.innerText = "SIGN IN";
            if (profileName) profileName.innerText = "GUEST";
            if (document.getElementById("admin-nav-btn")) {
                document.getElementById("admin-nav-btn").classList.add("hidden");
            }
            showToast("Session expired. You are now browsing as a Guest.", "info");
        } else {
            if (logoutBtn) logoutBtn.innerText = "LOGOUT";
            if (profileName) profileName.innerText = localStorage.getItem("username") || "USER";
            if (localStorage.getItem("is_admin") === "true" && document.getElementById("admin-nav-btn")) {
                document.getElementById("admin-nav-btn").classList.remove("hidden");
            }
        }
    } catch (err) {
        console.error("Could not verify session with server.");
    }
}

// ---- BOOT SEQUENCE ----
const currentHash = window.location.hash.replace("#", "");
const validTabs = ["calisthenics-page", "gym-page", "history-page"];

if (isLoggedIn) {
    if (logoutBtn) logoutBtn.innerText = "LOGOUT";
    if (profileName) profileName.innerText = localStorage.getItem("username") || "USER";
    if (localStorage.getItem("is_admin") === "true" && document.getElementById("admin-nav-btn")) {
        document.getElementById("admin-nav-btn").classList.remove("hidden");
    }
    const targetTab = validTabs.includes(currentHash) ? currentHash : "history-page";
    openDashboard(targetTab);
    verifySession();
} else {
    if (logoutBtn) logoutBtn.innerText = "SIGN IN";
    if (profileName) profileName.innerText = "GUEST";
    if (validTabs.includes(currentHash)) {
        openDashboard(currentHash);
    } else {
        showLandingScreen();
    }
}
