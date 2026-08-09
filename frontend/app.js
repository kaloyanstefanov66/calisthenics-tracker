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
let currentUnit = localStorage.getItem("apex_unit") || "KG";
let selectedChartRange = 7;
let historyOffset = 0;
const HISTORY_LIMIT = 20;
let cachedLogsList = [];
const exerciseCache = {};


// ---- UNIT TOGGLE LOGIC ----
const unitToggleBtn = document.getElementById("unit-toggle-btn");
if (unitToggleBtn) {
    unitToggleBtn.innerText = currentUnit;
    unitToggleBtn.addEventListener("click", () => {
        currentUnit = currentUnit === "KG" ? "LBS" : "KG";
        localStorage.setItem("apex_unit", currentUnit);
        unitToggleBtn.innerText = currentUnit;
        document.querySelectorAll(".unit-label").forEach(el => el.textContent = currentUnit);
        loadWorkoutHistory();
        renderPRs();
        showToast(`UNITS SET TO ${currentUnit}`, "info");
    });
}

function formatWeightValue(kgVal) {
    const val = parseFloat(kgVal) || 0;
    if (val <= 0) return "BODYWEIGHT";
    if (currentUnit === "LBS") {
        return (val * 2.20462).toFixed(1) + " LBS";
    }
    return val + " KG";
}


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
    if (!dateStr) return "";
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extractDateStr(log) {
    if (!log || !log.date) return new Date().toISOString().split("T")[0];
    const d = String(log.date);
    return d.includes("T") ? d.split("T")[0] : d.split(" ")[0];
}

function renderWorkoutContext(logs) {
    try {
        if (!logs || !Array.isArray(logs)) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        const normalizeDate = log => new Date(extractDateStr(log) + "T00:00:00");
        const weeklySets = logs.filter(log => normalizeDate(log) >= weekStart).reduce((total, log) => total + Number(log.sets || 0), 0);
        const uniqueDays = [...new Set(logs.map(log => normalizeDate(log).toDateString()))].map(date => new Date(date)).sort((a, b) => b - a);
        let streak = 0;
        const cursor = new Date(today);
        for (let i = 0; i < 365; i++) {
            if (uniqueDays.some(date => date.toDateString() === cursor.toDateString())) streak++;
            else if (i > 0) break;
            cursor.setDate(cursor.getDate() - 1);
        }
        const latest = logs[0];
        document.querySelectorAll('.weekly-sets, #weekly-sets').forEach(el => el.textContent = `${weeklySets} ${weeklySets === 1 ? 'set' : 'sets'}`);
        document.querySelectorAll('.training-streak, #training-streak').forEach(el => el.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`);
        document.querySelectorAll('.last-logged, #last-logged').forEach(el => el.textContent = latest ? `${latest.exercise_name} · ${formatDate(extractDateStr(latest))}` : 'Start your first session');
    } catch (err) {
        console.error("renderWorkoutContext error:", err);
    }
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
            openDashboard("calisthenics-page");
            checkGuestDataImport();
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
            checkGuestDataImport();
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
        openDashboard("calisthenics-page");
        checkGuestDataImport();
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
        e.target.setAttribute("aria-expanded", menu.classList.contains("show"));
    }
});

document.querySelectorAll('.dropdown-selected').forEach(selected => {
    selected.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selected.click();
        }
        if (e.key === 'Escape') {
            selected.nextElementSibling.classList.remove('show');
            selected.setAttribute('aria-expanded', 'false');
        }
    });
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
        isLoggedIn ? openDashboard("calisthenics-page") : showLandingScreen();
    }
});

// ---- 4. TAB NAVIGATION ----
function openDashboard(targetPage) {
    try {
        if (landingScreen) landingScreen.classList.add("hidden");
        if (selectionScreen) selectionScreen.classList.add("hidden");
        if (authWrapper) authWrapper.classList.add("hidden");
        if (appContainer) appContainer.classList.remove("hidden");
        window.history.pushState({ page: targetPage }, "", `#${targetPage}`);
        tabButtons.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.add("hidden"));
        const activeTabButton = document.querySelector(`[data-tab="${targetPage}"]`);
        const activeSection = document.getElementById(targetPage);
        if (activeTabButton) activeTabButton.classList.add("active");
        if (activeSection) activeSection.classList.remove("hidden");
        if (targetPage === "calisthenics-page" || targetPage === "gym-page") {
            document.querySelectorAll('.workout-mode').forEach(mode => {
                mode.classList.toggle('active', mode.getAttribute('data-tab') === targetPage);
            });
        }
        if (targetPage === "calisthenics-page") { loadExercises("Calisthenics"); loadWorkoutHistory(); }
        if (targetPage === "gym-page") { loadExercises("Gym"); loadWorkoutHistory(); }
        if (targetPage === "history-page") {
            loadWorkoutHistory();
            renderAnalyticsChart();
        }
    } catch (err) {
        console.error("openDashboard error:", err);
        if (appContainer) appContainer.classList.remove("hidden");
    }
}


tabButtons.forEach(btn => {
    btn.addEventListener("click", () => openDashboard(btn.getAttribute("data-tab")));
});

document.querySelectorAll('.workout-mode').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        openDashboard(targetTab);
    });
});

// ---- REST TIMER ENHANCEMENTS WITH PERSISTENCE ----
let restTimerInterval = null;

function checkActiveRestTimer() {
    const timerEnd = sessionStorage.getItem("rest_timer_end");
    if (!timerEnd) return;
    const now = Date.now();
    const remainingSeconds = Math.ceil((parseInt(timerEnd) - now) / 1000);
    if (remainingSeconds <= 0) {
        sessionStorage.removeItem("rest_timer_end");
        document.querySelectorAll(".rest-time").forEach(el => el.textContent = "01:30");
        document.querySelectorAll(".rest-start").forEach(btn => btn.classList.remove("active-timer-btn"));
        return;
    }

    if (restTimerInterval) clearInterval(restTimerInterval);

    const updateDisplay = (secs) => {
        const minStr = String(Math.floor(secs / 60)).padStart(2, "0");
        const secStr = String(secs % 60).padStart(2, "0");
        document.querySelectorAll(".rest-time").forEach(el => el.textContent = `${minStr}:${secStr}`);
    };

    updateDisplay(remainingSeconds);

    restTimerInterval = setInterval(() => {
        const currentRemaining = Math.ceil((parseInt(sessionStorage.getItem("rest_timer_end") || "0") - Date.now()) / 1000);
        if (currentRemaining <= 0) {
            clearInterval(restTimerInterval);
            sessionStorage.removeItem("rest_timer_end");
            document.querySelectorAll(".rest-time").forEach(el => el.textContent = "01:30");
            document.querySelectorAll(".rest-start").forEach(btn => btn.classList.remove("active-timer-btn"));
            showToast("Rest complete — ready for your next set!", "success");
        } else {
            updateDisplay(currentRemaining);
        }
    }, 1000);
}

document.querySelectorAll('.rest-start').forEach(button => {
    button.addEventListener('click', (e) => {
        e.preventDefault();
        const seconds = parseInt(button.getAttribute("data-seconds") || "90");
        const secsStr = button.getAttribute("data-seconds") || "90";
        document.querySelectorAll(".rest-start").forEach(btn => {
            btn.classList.remove("active-timer-btn");
        });
        document.querySelectorAll(`.rest-start[data-seconds="${secsStr}"]`).forEach(btn => {
            btn.classList.add("active-timer-btn");
        });

        const timerEnd = Date.now() + seconds * 1000;
        sessionStorage.setItem("rest_timer_end", timerEnd.toString());
        checkActiveRestTimer();
    });
});

window.addEventListener("focus", checkActiveRestTimer);
document.addEventListener("DOMContentLoaded", checkActiveRestTimer);



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

// ---- FIX #5: LAST WEIGHT MEMORY BY EXERCISE NAME ----
function saveLastWeight(exerciseName, weight) {
    if (!exerciseName || parseFloat(weight) <= 0) return;
    const weights = JSON.parse(localStorage.getItem("last_weights_by_name") || "{}");
    weights[exerciseName.toUpperCase()] = weight;
    localStorage.setItem("last_weights_by_name", JSON.stringify(weights));
}

function getLastWeight(exerciseName) {
    if (!exerciseName) return "";
    const weights = JSON.parse(localStorage.getItem("last_weights_by_name") || "{}");
    return weights[exerciseName.toUpperCase()] || "";
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

    if (exerciseCache[type]) {
        renderExerciseDropdown(type, exerciseCache[type], dropdownOptions, dropdownSelected, hiddenInput, weightInput);
        return;
    }

    dropdownSelected.innerText = `LOADING...`;
    dropdownSelected.classList.remove("has-value");
    if (hiddenInput) hiddenInput.value = "";

    try {
        const response = await fetch(`${API_URL}/exercises?type=${type}`, { credentials: "include" });
        if (!response.ok) throw new Error("Could not load exercises");
        const exercises = await response.json();
        exerciseCache[type] = exercises;
        renderExerciseDropdown(type, exercises, dropdownOptions, dropdownSelected, hiddenInput, weightInput);
    } catch (err) {
        dropdownSelected.innerText = `SELECT ${type.toUpperCase()} EXERCISE...`;
        showToast("Could not load exercises. Check your connection.", "error");
        console.error(err);
    }
}

function renderExerciseDropdown(type, exercises, dropdownOptions, dropdownSelected, hiddenInput, weightInput) {
    dropdownSelected.innerText = `SELECT ${type.toUpperCase()} EXERCISE...`;
    const grouped = {};
    exercises.forEach(ex => {
        const cat = ex.category.toUpperCase();
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(ex);
    });

    let htmlContent = `<input class="exercise-search" type="search" placeholder="SEARCH EXERCISES" aria-label="Search exercises">`;
    for (const category in grouped) {
        htmlContent += `<div class="dropdown-category-header" style="padding: 8px 12px; color: #666; font-size: 11px; font-weight: 700; background: #16161a; letter-spacing: 1px;">— ${category} —</div>`;
        grouped[category].forEach(ex => {
            htmlContent += `<div class="dropdown-option" data-value="${ex.id}" data-name="${ex.name.toUpperCase()}" style="padding-left: 20px;">${ex.name.toUpperCase()}</div>`;
        });
    }

    dropdownOptions.innerHTML = htmlContent;

    const searchInput = dropdownOptions.querySelector('.exercise-search');
    searchInput.addEventListener('click', e => e.stopPropagation());
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toUpperCase();
        dropdownOptions.querySelectorAll('.dropdown-option').forEach(option => {
            option.hidden = !option.innerText.includes(query);
        });
        dropdownOptions.querySelectorAll('.dropdown-category-header').forEach(header => {
            let next = header.nextElementSibling;
            let hasVisibleOption = false;
            while (next && !next.classList.contains('dropdown-category-header')) {
                if (next.classList.contains('dropdown-option') && !next.hidden) hasVisibleOption = true;
                next = next.nextElementSibling;
            }
            header.hidden = !hasVisibleOption;
        });
    });

    dropdownOptions.querySelectorAll('.dropdown-option').forEach(option => {
        option.addEventListener("click", () => {
            dropdownSelected.innerText = option.innerText;
            dropdownSelected.classList.add("has-value");
            hiddenInput.value = option.getAttribute("data-value");
            hiddenInput.dataset.name = option.getAttribute("data-name");
            dropdownOptions.classList.remove("show");
            dropdownSelected.setAttribute("aria-expanded", "false");

            if (weightInput) {
                const lastWeight = getLastWeight(option.getAttribute("data-name"));
                weightInput.value = lastWeight;
            }
        });
    });
}


async function loadWorkoutHistory(append = false) {
    const tableBody = document.getElementById("history-table-body");
    const loadMoreBtn = document.getElementById("load-more-btn");
    try {
        let logs = [];
        if (!append) historyOffset = 0;

        if (isLoggedIn) {
            const response = await fetch(`${API_URL}/logs?limit=${HISTORY_LIMIT}&offset=${historyOffset}`, { credentials: "include" });
            if (!response.ok) throw new Error("Could not load history");
            logs = await response.json();
        } else {
            const allGuestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
            const sorted = allGuestLogs.sort((a, b) => b.id - a.id);
            logs = sorted.slice(historyOffset, historyOffset + HISTORY_LIMIT);
        }

        if (append) {
            cachedLogsList = cachedLogsList.concat(logs);
        } else {
            cachedLogsList = logs;
        }

        renderWorkoutContext(cachedLogsList);
        renderStreakGrid(cachedLogsList);
        renderPRs();

        if (loadMoreBtn) {
            loadMoreBtn.classList.toggle("hidden", logs.length < HISTORY_LIMIT);
        }

        if (cachedLogsList.length === 0) {
            tableBody.innerHTML = `
                <div class="log-empty">NO SETS LOGGED YET — PICK AN EXERCISE ABOVE TO GET STARTED</div>`;
            return;
        }

        const maxWeights = {};
        cachedLogsList.forEach(l => {
            const name = l.exercise_name.toUpperCase();
            if (!maxWeights[name] || l.weight_added > maxWeights[name]) {
                maxWeights[name] = l.weight_added;
            }
        });

        const dayGroups = new Map();
        cachedLogsList.forEach(log => {
            const dateKey = extractDateStr(log);
            if (!dayGroups.has(dateKey)) dayGroups.set(dateKey, []);
            dayGroups.get(dateKey).push(log);
        });


        tableBody.innerHTML = [...dayGroups.entries()].map(([dateKey, dayLogs]) => {
            const totalSets = dayLogs.reduce((sum, l) => sum + Number(l.sets || 0), 0);
            const weekday = new Date(dateKey + "T00:00:00").toLocaleDateString('en-US', { weekday: 'long' });
            const entriesHtml = dayLogs.map(log => {
                const exName = log.exercise_name.toUpperCase();
                const isPR = log.weight_added > 0 && log.weight_added === maxWeights[exName];
                return `
                <div class="log-entry">
                    <div class="log-entry-main">
                        <span class="log-entry-name">${exName} ${isPR ? '<span class="pr-badge">🏆 PR</span>' : ''}</span>
                        <span class="log-entry-type">${log.workout_type.toUpperCase()}</span>
                    </div>
                    <div class="log-entry-stats">
                        <span>${log.sets} SETS</span>
                        <span>${log.reps} REPS</span>
                        <span>${formatWeightValue(log.weight_added)}</span>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn-edit" data-id="${log.id}" data-sets="${log.sets}" data-reps="${log.reps}" data-weight="${log.weight_added}" aria-label="Edit set">✏️</button>
                        <button class="btn-delete" data-id="${log.id}" aria-label="Delete set">✕</button>
                    </div>
                </div>
            `;
            }).join("");

            return `
                <div class="log-day">
                    <div class="log-day-header">
                        <div class="log-day-title">
                            <span class="log-day-date">${formatDate(dateKey)}</span>
                            <span class="log-day-weekday">${weekday}</span>
                        </div>
                        <span class="log-day-meta">${dayLogs.length} EXERCISE${dayLogs.length > 1 ? 'S' : ''} · ${totalSets} SETS</span>
                    </div>
                    <div class="log-day-entries">${entriesHtml}</div>
                </div>
            `;
        }).join("");
    } catch (err) {
        showToast("Could not load training history.", "error");
        console.error(err);
    }
}

const loadMoreBtn = document.getElementById("load-more-btn");
if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
        historyOffset += HISTORY_LIMIT;
        loadWorkoutHistory(true);
    });
}



// ---- DELETE & EDIT LOG VARIABLES ----
const historyTableBody = document.getElementById("history-table-body");
const confirmModal = document.getElementById("confirm-modal");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalConfirmBtn = document.getElementById("modal-confirm-btn");
let pendingDeleteId = null;

// ---- EDIT LOG MODAL LOGIC ----
const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-log-form");
const editCancelBtn = document.getElementById("edit-cancel-btn");

if (historyTableBody) {

    historyTableBody.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-delete")) {
            pendingDeleteId = e.target.getAttribute("data-id");
            confirmModal.classList.remove("hidden");
        }
        if (e.target.classList.contains("btn-edit")) {
            const id = e.target.getAttribute("data-id");
            const sets = e.target.getAttribute("data-sets");
            const reps = e.target.getAttribute("data-reps");
            const weight = e.target.getAttribute("data-weight");

            document.getElementById("edit-log-id").value = id;
            document.getElementById("edit-sets").value = sets;
            document.getElementById("edit-reps").value = reps;
            document.getElementById("edit-weight").value = weight;
            editModal.classList.remove("hidden");
        }
    });
}

if (editCancelBtn) {
    editCancelBtn.addEventListener("click", () => editModal.classList.add("hidden"));
}

if (editForm) {
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("edit-log-id").value;
        const sets = parseInt(document.getElementById("edit-sets").value);
        const reps = parseInt(document.getElementById("edit-reps").value);
        const weight = parseFloat(document.getElementById("edit-weight").value || 0);

        editModal.classList.add("hidden");
        try {
            if (isLoggedIn) {
                const response = await fetch(`${API_URL}/logs/${id}`, {
                    method: "PUT",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sets, reps, weight_added: weight })
                });
                if (!response.ok) throw new Error("Could not update log");
            } else {
                let guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
                guestLogs = guestLogs.map(l => l.id.toString() === id.toString() ? { ...l, sets, reps, weight_added: weight } : l);
                localStorage.setItem("guest_logs", JSON.stringify(guestLogs));
            }
            showToast("LOG UPDATED", "success");
            loadWorkoutHistory();
            renderAnalyticsChart();
        } catch (err) {
            showToast(err.message, "error");
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

document.querySelectorAll(".chart-range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".chart-range-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedChartRange = parseInt(btn.getAttribute("data-days") || "7");
        renderAnalyticsChart();
    });
});

async function renderAnalyticsChart() {
    const chartCanvas = document.getElementById('volumeChart');
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    try {
        let chartLabels = [];
        let chartData = [];

        if (isLoggedIn) {
            const response = await fetch(`${API_URL}/analytics?days=${selectedChartRange}`, { credentials: "include" });
            if (!response.ok) throw new Error("Could not fetch analytics data");
            const data = await response.json();
            chartLabels = data.labels.map(d => formatDate(d));
            chartData = data.volume;
        } else {
            const guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
            const volumeMap = {};
            guestLogs.forEach(log => {
                const date = extractDateStr(log);
                const weight = log.weight_added > 0 ? log.weight_added : 1;
                const vol = log.sets * log.reps * weight;
                volumeMap[date] = (volumeMap[date] || 0) + vol;
            });

            const today = new Date();
            for (let i = selectedChartRange - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const dateStr = d.toISOString().split("T")[0];
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
                    borderColor: '#9eb86c',
                    backgroundColor: 'rgba(158, 184, 108, 0.05)',
                    borderWidth: 2,
                    pointBackgroundColor: '#9eb86c',
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

// ---- PRs & STREAK GRID ENGINES ----
async function renderPRs() {
    const prsListEl = document.getElementById("prs-list");
    if (!prsListEl) return;
    try {
        let prs = [];
        if (isLoggedIn) {
            const res = await fetch(`${API_URL}/logs/prs`, { credentials: "include" });
            if (res.ok) prs = await res.json();
        } else {
            const guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
            const map = {};
            guestLogs.forEach(l => {
                const name = l.exercise_name.toUpperCase();
                if (!map[name]) map[name] = { exercise_name: name, workout_type: l.workout_type, max_weight: 0, max_reps_volume: 0 };
                if (l.weight_added > map[name].max_weight) map[name].max_weight = l.weight_added;
                if (l.sets * l.reps > map[name].max_reps_volume) map[name].max_reps_volume = l.sets * l.reps;
            });
            prs = Object.values(map);
        }

        if (prs.length === 0) {
            prsListEl.innerHTML = `<div class="log-empty">No PRs recorded yet</div>`;
            return;
        }

        prsListEl.innerHTML = prs.map(pr => `
            <div class="pr-item">
                <span class="pr-name">${pr.exercise_name.toUpperCase()}</span>
                <span class="pr-val">${pr.max_weight > 0 ? formatWeightValue(pr.max_weight) : pr.max_reps_volume + ' MAX REPS'}</span>
            </div>
        `).join("");
    } catch (err) {
        console.error("Error loading PRs:", err);
    }
}

function renderStreakGrid(logs) {
    try {
        const gridEl = document.getElementById("streak-grid");
        if (!gridEl) return;
        if (!logs || !Array.isArray(logs)) return;
        const logDates = new Set(logs.map(l => extractDateStr(l)));
        const today = new Date();
        let html = "";
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            const active = logDates.has(dateStr);
            html += `<div class="streak-cell ${active ? 'has-workout' : ''}" title="${dateStr}: ${active ? 'Trained' : 'Rest'}"></div>`;
        }
        gridEl.innerHTML = html;
    } catch (e) {
        console.error("renderStreakGrid error:", e);
    }
}



// ---- WORKOUT SUBMISSION ----
document.querySelectorAll(".workout-form").forEach(form => {
    const setsInput = form.querySelector(".input-sets");
    const repsInput = form.querySelector(".input-reps");
    const weightInput = form.querySelector(".input-weight");
    const submitBtn = form.querySelector(".btn-action");

    // Keyboard enter submit support across numeric inputs
    [setsInput, repsInput, weightInput].forEach(inp => {
        if (inp) {
            inp.addEventListener("keydown", e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    form.requestSubmit();
                }
            });
        }
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const defaultType = form.getAttribute("data-type");
        const exerciseInput = form.querySelector(".exercise-input");
        const exerciseId = exerciseInput.value;
        const sets = form.querySelector(".input-sets").value;
        const reps = form.querySelector(".input-reps").value;
        const weightAdded = form.querySelector(".input-weight").value || 0;
        const dateInput = form.querySelector(".input-date");
        const customDate = dateInput ? dateInput.value : null;

        if (!exerciseId) {
            showToast("PLEASE SELECT AN EXERCISE", "error");
            return;
        }

        if (submitBtn) {
            submitBtn.classList.add("pulse-success");
            setTimeout(() => submitBtn.classList.remove("pulse-success"), 450);
        }

        try {
            const exerciseName = exerciseInput.dataset.name || exerciseId;
            if (isLoggedIn) {
                const payload = {
                    exercise_id: parseInt(exerciseId),
                    sets: parseInt(sets),
                    reps: parseInt(reps),
                    weight_added: parseFloat(weightAdded)
                };
                if (customDate) payload.workout_date = customDate;

                const response = await fetch(`${API_URL}/logs`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error("Failed to log set");
            } else {
                const allGuestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
                allGuestLogs.push({
                    id: Date.now(),
                    exercise_name: exerciseName,
                    workout_type: defaultType,
                    sets: parseInt(sets),
                    reps: parseInt(reps),
                    weight_added: parseFloat(weightAdded),
                    date: customDate ? new Date(customDate).toISOString() : new Date().toISOString()
                });
                if (allGuestLogs.length > 200) allGuestLogs.splice(0, allGuestLogs.length - 200);
                localStorage.setItem("guest_logs", JSON.stringify(allGuestLogs));
            }

            saveLastWeight(exerciseName, weightAdded);
            showToast(isLoggedIn ? "SET LOGGED" : "GUEST SET LOGGED", "success");

            const currentExerciseId = exerciseInput.value;
            const currentExerciseName = exerciseInput.dataset.name;
            const currentDropdownText = form.querySelector(".dropdown-selected").innerText;
            form.reset();

            form.querySelector(".dropdown-selected").innerText = currentDropdownText;
            form.querySelector(".dropdown-selected").classList.add("has-value");
            exerciseInput.value = currentExerciseId;
            exerciseInput.dataset.name = currentExerciseName;

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

// ---- 10. AI COACH CHAT WIDGET ----
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatPanel = document.getElementById("chat-panel");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessagesEl = document.getElementById("chat-messages");

let chatHistory = [];

function appendChatBubble(role, message) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = message;
    chatMessagesEl.appendChild(bubble);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    return bubble;
}

if (chatToggleBtn) {
    chatToggleBtn.addEventListener("click", () => {
        const willOpen = chatPanel.classList.contains("hidden");
        chatPanel.classList.toggle("hidden");
        chatToggleBtn.setAttribute("aria-expanded", willOpen);
        if (willOpen) {
            if (chatMessagesEl.children.length === 0) {
                appendChatBubble("assistant", isLoggedIn
                    ? "Hey! I can see your logged workouts — ask me anything about your training, progress, or what to do next."
                    : "Hi! Sign in first so I can look at your workout history and give you tailored advice.");
            }
            chatInput.focus();
        }
    });
}

if (chatCloseBtn) {
    chatCloseBtn.addEventListener("click", () => {
        chatPanel.classList.add("hidden");
        chatToggleBtn.setAttribute("aria-expanded", "false");
    });
}

if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;

        if (!isLoggedIn) {
            showToast("Sign in to chat with your AI coach.", "error");
            return;
        }

        appendChatBubble("user", message);
        chatHistory.push({ role: "user", content: message });
        chatInput.value = "";
        chatInput.disabled = true;

        const thinkingBubble = appendChatBubble("assistant", "Thinking...");

        try {
            const response = await fetch(`${API_URL}/chat`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: chatHistory })
            });
            if (!response.ok) {
                if (response.status === 429) throw new Error("Slow down a little — try again in a minute.");
                if (response.status === 401) throw new Error("Session expired. Please sign in again.");
                throw new Error("The coach couldn't respond. Please try again.");
            }
            const data = await response.json();
            thinkingBubble.textContent = data.reply;
            chatHistory.push({ role: "assistant", content: data.reply });
            if (chatHistory.length > 16) chatHistory = chatHistory.slice(-16);
        } catch (err) {
            thinkingBubble.textContent = err.message;
            thinkingBubble.classList.add("chat-error");
        } finally {
            chatInput.disabled = false;
            chatInput.focus();
            chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        }
    });
}

// ---- GUEST IMPORT ENGINE ----
function checkGuestDataImport() {
    const guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
    if (guestLogs.length > 0 && isLoggedIn) {
        const modal = document.getElementById("guest-import-modal");
        if (modal) modal.classList.remove("hidden");
    }
}

const guestSyncBtn = document.getElementById("guest-sync-btn");
const guestSkipBtn = document.getElementById("guest-skip-btn");

if (guestSyncBtn) {
    guestSyncBtn.addEventListener("click", async () => {
        const modal = document.getElementById("guest-import-modal");
        if (modal) modal.classList.add("hidden");
        const guestLogs = JSON.parse(localStorage.getItem("guest_logs") || "[]");
        let successCount = 0;
        for (const log of guestLogs) {
            try {
                // Fetch exercises matching name or fallback
                const res = await fetch(`${API_URL}/exercises?type=${log.workout_type}`);
                if (res.ok) {
                    const exercises = await res.json();
                    const match = exercises.find(e => e.name.toUpperCase() === log.exercise_name.toUpperCase());
                    if (match) {
                        await fetch(`${API_URL}/logs`, {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                exercise_id: match.id,
                                sets: log.sets,
                                reps: log.reps,
                                weight_added: log.weight_added,
                                workout_date: log.date.split("T")[0]
                            })
                        });
                        successCount++;
                    }
                }
            } catch (err) {
                console.error("Error migrating log:", err);
            }
        }
        localStorage.removeItem("guest_logs");
        showToast(`SYNCED ${successCount} GUEST LOGS TO ACCOUNT!`, "success");
        loadWorkoutHistory();
        renderAnalyticsChart();
    });
}

if (guestSkipBtn) {
    guestSkipBtn.addEventListener("click", () => {
        const modal = document.getElementById("guest-import-modal");
        if (modal) modal.classList.add("hidden");
        localStorage.removeItem("guest_logs");
        showToast("GUEST LOGS DISCARDED", "info");
    });
}

// ---- ROUTINE TEMPLATES ENGINE ----
const defaultCalisthenicsTemplates = [
    { name: "PUSH-UP FOUNDATION", exerciseName: "PUSH-UPS", sets: 3, reps: 12, weight: 0 },
    { name: "PULL-UP VOLUME", exerciseName: "PULL-UPS", sets: 4, reps: 8, weight: 0 },
    { name: "DIP STRENGTH", exerciseName: "DIPS", sets: 3, reps: 10, weight: 0 }
];

const defaultGymTemplates = [
    { name: "BENCH PRESS STRENGTH", exerciseName: "BARBELL BENCH PRESS", sets: 4, reps: 6, weight: 60 },
    { name: "SQUAT HYPERTROPHY", exerciseName: "BARBELL SQUAT", sets: 4, reps: 8, weight: 80 },
    { name: "DEADLIFT POWER", exerciseName: "DEADLIFT", sets: 3, reps: 5, weight: 100 }
];

function setupTemplates(type, selectId, saveBtnId) {
    const selectEl = document.getElementById(selectId);
    const saveBtn = document.getElementById(saveBtnId);
    if (!selectEl || !saveBtn) return;

    const storageKey = `apex_templates_${type.toLowerCase()}`;
    const defaultList = type === "Calisthenics" ? defaultCalisthenicsTemplates : defaultGymTemplates;

    if (!localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, JSON.stringify(defaultList));
    }

    const renderTemplates = () => {
        const templates = JSON.parse(localStorage.getItem(storageKey) || "[]");
        selectEl.innerHTML = `<option value="">Select preset routine...</option>` + templates.map((t, idx) => `
            <option value="${idx}">${t.name} — ${t.exerciseName} (${t.sets}x${t.reps}${t.weight > 0 ? ' @ ' + t.weight + 'kg' : ''})</option>
        `).join("");
    };

    renderTemplates();

    saveBtn.addEventListener("click", () => {
        const form = saveBtn.closest(".clean-card").querySelector(".workout-form");
        const exerciseInput = form.querySelector(".exercise-input");
        const exerciseId = exerciseInput.value;
        const exerciseName = exerciseInput.dataset.name;
        const sets = form.querySelector(".input-sets").value;
        const reps = form.querySelector(".input-reps").value;
        const weight = form.querySelector(".input-weight").value || 0;

        if (!exerciseId && !exerciseName) {
            showToast("SELECT AN EXERCISE FIRST", "error");
            return;
        }

        const nameInput = prompt("Enter preset name:", `${exerciseName || 'ROUTINE'} ${sets}x${reps}`);
        if (!nameInput) return;

        const templates = JSON.parse(localStorage.getItem(storageKey) || "[]");
        templates.push({
            name: nameInput.toUpperCase(),
            exerciseId,
            exerciseName: (exerciseName || exerciseId).toUpperCase(),
            dropdownText: form.querySelector(".dropdown-selected").innerText,
            sets: parseInt(sets),
            reps: parseInt(reps),
            weight: parseFloat(weight)
        });
        localStorage.setItem(storageKey, JSON.stringify(templates));
        renderTemplates();
        showToast("PRESET SAVED", "success");
    });

    selectEl.addEventListener("change", async () => {
        const idx = selectEl.value;
        if (idx === "") return;
        const templates = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const t = templates[idx];
        if (!t) return;

        const form = selectEl.closest(".clean-card").querySelector(".workout-form");
        const dropdownSelected = form.querySelector(".dropdown-selected");
        const hiddenInput = form.querySelector(".exercise-input");

        let exList = exerciseCache[type];
        if (!exList) {
            try {
                const res = await fetch(`${API_URL}/exercises?type=${type}`, { credentials: "include" });
                if (res.ok) {
                    exList = await res.json();
                    exerciseCache[type] = exList;
                }
            } catch (e) {}
        }

        let match = exList ? exList.find(e => e.name.toUpperCase().includes(t.exerciseName.toUpperCase()) || t.exerciseName.toUpperCase().includes(e.name.toUpperCase())) : null;

        if (match) {
            dropdownSelected.innerText = match.name.toUpperCase();
            dropdownSelected.classList.add("has-value");
            hiddenInput.value = match.id;
            hiddenInput.dataset.name = match.name.toUpperCase();
        } else if (t.exerciseId) {
            dropdownSelected.innerText = t.dropdownText || t.exerciseName;
            dropdownSelected.classList.add("has-value");
            hiddenInput.value = t.exerciseId;
            hiddenInput.dataset.name = t.exerciseName;
        } else {
            dropdownSelected.innerText = t.exerciseName;
            dropdownSelected.classList.add("has-value");
            hiddenInput.dataset.name = t.exerciseName;
        }

        form.querySelector(".input-sets").value = t.sets;
        form.querySelector(".input-reps").value = t.reps;
        form.querySelector(".input-weight").value = t.weight || 0;
        showToast(`LOADED PRESET: ${t.name}`, "info");
    });
}

setupTemplates("Calisthenics", "calisthenics-template-select", "save-calisthenics-template");
setupTemplates("Gym", "gym-template-select", "save-gym-template");




// ---- BOOT SEQUENCE ----
try {
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
} catch (bootErr) {
    console.error("Boot sequence error:", bootErr);
    if (landingScreen) landingScreen.classList.remove("hidden");
    else if (appContainer) appContainer.classList.remove("hidden");
}

