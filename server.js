import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const { Pool } = pkg;
const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- GEMINI INITIALIZATION ----
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECRET;
let aiClient = null;
if (geminiApiKey) {
    try {
        aiClient = new GoogleGenAI({
            apiKey: geminiApiKey,
            httpOptions: {
                headers: {
                    'User-Agent': 'aistudio-build'
                }
            }
        });
        console.log("Gemini AI Client initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize Gemini Client:", err);
    }
} else {
    console.warn("GEMINI_API_KEY is not defined in the environment. Chatbot features will use fallback mock answers.");
}

// ---- JWT CONFIGURATION ----
const SECRET_KEY = process.env.JWT_SECRET_KEY || "apex-super-secret-key-123456789";
const ALGORITHM = process.env.JWT_ALGORITHM || "HS256";
const ACCESS_TOKEN_EXPIRE_MINUTES = 129600; // 90 days

// ---- DATABASE CONFIGURATION (PG OR IN-MEMORY FALLBACK) ----
const DATABASE_URL = process.env.DATABASE_URL;
let dbPool = null;
let useInMemory = true;

// In-Memory Database Stubs (used as fallback or primary if DB offline)
const inMemoryStore = {
    users: [
        { id: 1, username: "ADMIN", email: "admin@apex.com", password: bcrypt.hashSync("admin123", 10), is_admin: true },
        { id: 2, username: "GUEST", email: "guest@apex.com", password: bcrypt.hashSync("guest123", 10), is_admin: false }
    ],
    exercises: [
        // Calisthenics
        { id: 1, name: "PULL-UP", category: "BACK", workout_type: "Calisthenics" },
        { id: 2, name: "DIP", category: "CHEST", workout_type: "Calisthenics" },
        { id: 3, name: "PUSH-UP", category: "CHEST", workout_type: "Calisthenics" },
        { id: 4, name: "MUSCLE-UP", category: "BACK", workout_type: "Calisthenics" },
        { id: 5, name: "HANDSTAND PUSH-UP", category: "SHOULDERS", workout_type: "Calisthenics" },
        { id: 6, name: "L-SIT", category: "CORE", workout_type: "Calisthenics" },
        { id: 7, name: "PISTOL SQUAT", category: "LEGS", workout_type: "Calisthenics" },
        // Gym
        { id: 8, name: "BENCH PRESS", category: "CHEST", workout_type: "Gym" },
        { id: 9, name: "SQUAT", category: "LEGS", workout_type: "Gym" },
        { id: 10, name: "DEADLIFT", category: "BACK", workout_type: "Gym" },
        { id: 11, name: "OVERHEAD PRESS", category: "SHOULDERS", workout_type: "Gym" },
        { id: 12, name: "BARBELL ROW", category: "BACK", workout_type: "Gym" },
        { id: 13, name: "BICEP CURL", category: "ARMS", workout_type: "Gym" },
        { id: 14, name: "TRICEP PUSHDOWN", category: "ARMS", workout_type: "Gym" }
    ],
    workout_logs: [
        // Seed some history logs
        { id: 1, user_id: 2, exercise_id: 1, sets: 3, reps: 10, weight_added: 0, workout_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        { id: 2, user_id: 2, exercise_id: 2, sets: 3, reps: 12, weight_added: 10, workout_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { id: 3, user_id: 2, exercise_id: 8, sets: 4, reps: 8, weight_added: 80, workout_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }
    ],
    nextUserId: 3,
    nextExerciseId: 15,
    nextLogId: 4
};

if (DATABASE_URL) {
    try {
        dbPool = new Pool({
            connectionString: DATABASE_URL,
            ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : { rejectUnauthorized: false }
        });
        // Test connection
        await dbPool.query('SELECT NOW()');
        useInMemory = false;
        console.log("Connected to PostgreSQL Database successfully.");
        
        // Ensure schemas exist
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS exercises (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(100) NOT NULL,
                workout_type VARCHAR(100) NOT NULL,
                UNIQUE(name, workout_type)
            );
            
            CREATE TABLE IF NOT EXISTS workout_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
                sets INTEGER NOT NULL,
                reps INTEGER NOT NULL,
                weight_added DOUBLE PRECISION DEFAULT 0.0,
                workout_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database tables verified/created.");

        // Seed default exercises if table is empty
        const exCount = await dbPool.query('SELECT COUNT(*) FROM exercises');
        if (parseInt(exCount.rows[0].count) === 0) {
            console.log("Seeding default exercises in PostgreSQL...");
            for (const ex of inMemoryStore.exercises) {
                await dbPool.query(
                    'INSERT INTO exercises (name, category, workout_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                    [ex.name, ex.category, ex.workout_type]
                );
            }
            console.log("Default exercises seeded.");
        }
    } catch (err) {
        console.error("PostgreSQL connection failed. Falling back to robust in-memory database store.", err);
        useInMemory = true;
    }
} else {
    console.log("No DATABASE_URL found. Running fully in robust in-memory database store.");
}

// ---- AUTH UTILS ----
function get_current_user(req) {
    const access_token = req.cookies.access_token;
    if (!access_token) {
        return null;
    }
    try {
        const token = access_token.replace("Bearer ", "");
        const payload = jwt.verify(token, SECRET_KEY);
        return payload.user_id;
    } catch (err) {
        return null;
    }
}

async function is_admin_user(userId) {
    if (useInMemory) {
        const user = inMemoryStore.users.find(u => u.id === userId);
        return user ? !!user.is_admin : false;
    } else {
        const res = await dbPool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
        return res.rows.length > 0 ? !!res.rows[0].is_admin : false;
    }
}

// ---- API ENDPOINTS ----

// REGISTER
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ detail: "Missing username, email or password" });
    }

    try {
        const hpwd = bcrypt.hashSync(password, 10);
        
        if (useInMemory) {
            const exists = inMemoryStore.users.find(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase());
            if (exists) {
                return res.status(400).json({ detail: "Username or Email already registered" });
            }
            const newUser = {
                id: inMemoryStore.nextUserId++,
                username,
                email,
                password: hpwd,
                is_admin: false
            };
            inMemoryStore.users.push(newUser);
        } else {
            const exists = await dbPool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)', [username, email]);
            if (exists.rows.length > 0) {
                return res.status(400).json({ detail: "Username or Email already registered" });
            }
            await dbPool.query(
                'INSERT INTO users (username, email, hashed_password) VALUES ($1, $2, $3)',
                [username, email, hpwd]
            );
        }

        return res.json({ message: "User registered successfully!" });
    } catch (err) {
        console.error("Register error:", err);
        return res.status(500).json({ detail: "Registration failed due to server error" });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    // Check if body is form-urlencoded (FastAPI style) or JSON
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(400).json({ detail: "Missing username or password" });
    }

    try {
        let user = null;
        if (useInMemory) {
            user = inMemoryStore.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        } else {
            const result = await dbPool.query('SELECT id, username, hashed_password, is_admin FROM users WHERE LOWER(username) = LOWER($1)', [username]);
            if (result.rows.length > 0) {
                user = {
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    password: result.rows[0].hashed_password,
                    is_admin: result.rows[0].is_admin
                };
            }
        }

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ detail: "Invalid credentials" });
        }

        const token = jwt.sign({ sub: user.username, user_id: user.id }, SECRET_KEY, { expiresIn: '90d' });
        
        res.cookie('access_token', `Bearer ${token}`, {
            httpOnly: true,
            maxAge: ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
            sameSite: 'none',
            secure: true // true so it works across platforms/iframes
        });

        return res.json({
            message: "Authentication successful",
            is_admin: !!user.is_admin,
            username: user.username
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ detail: "Authentication failed due to server error" });
    }
});

// GOOGLE SSO
app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ detail: "Missing Google authentication token" });
    }

    // In a sandbox, let's parse or mock validation of the Google token.
    // We can extract token contents, or since it's a sandbox, register/login the user directly.
    try {
        // Typically verify the ID token. For robust sandbox fallback:
        let email = "sso-user@gmail.com";
        let username = "SSO_USER";
        
        // Decrypt or decode JWT header if we want to extract real SSO info, or fall back
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.email) {
                email = decoded.email;
                username = decoded.given_name || decoded.name || email.split('@')[0];
            }
        } catch (e) {
            // Ignored
        }

        username = username.toUpperCase();

        let user = null;
        if (useInMemory) {
            user = inMemoryStore.users.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (!user) {
                user = {
                    id: inMemoryStore.nextUserId++,
                    username,
                    email,
                    password: bcrypt.hashSync("GOOGLE_SSO_USER", 10),
                    is_admin: false
                };
                inMemoryStore.users.push(user);
            }
        } else {
            const result = await dbPool.query('SELECT id, username, is_admin FROM users WHERE LOWER(email) = LOWER($1)', [email]);
            if (result.rows.length > 0) {
                user = result.rows[0];
            } else {
                const insertRes = await dbPool.query(
                    'INSERT INTO users (username, email, hashed_password, is_admin) VALUES ($1, $2, $3, FALSE) RETURNING id, username, is_admin',
                    [username, email, "GOOGLE_SSO_USER"]
                );
                user = insertRes.rows[0];
            }
        }

        const access_token = jwt.sign({ sub: user.username, user_id: user.id }, SECRET_KEY, { expiresIn: '90d' });
        
        res.cookie('access_token', `Bearer ${access_token}`, {
            httpOnly: true,
            maxAge: ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
            sameSite: 'none',
            secure: true
        });

        return res.json({
            message: "Authentication successful",
            is_admin: !!user.is_admin,
            username: user.username
        });
    } catch (err) {
        console.error("Google auth error:", err);
        return res.status(500).json({ detail: "Google authentication failed" });
    }
});

// EXERCISES
app.post('/exercises', async (req, res) => {
    const current_user_id = get_current_user(req);
    if (!current_user_id) {
        return res.status(401).json({ detail: "Not authenticated" });
    }
    const admin = await is_admin_user(current_user_id);
    if (!admin) {
        return res.status(403).json({ detail: "Access Denied: Admin privileges required" });
    }

    const { name, category, workout_type } = req.body;
    if (!name || !category || !workout_type) {
        return res.status(400).json({ detail: "Missing exercise name, category, or workout_type" });
    }

    const upperName = name.toUpperCase();
    const upperCategory = category.toUpperCase();

    try {
        if (useInMemory) {
            const exists = inMemoryStore.exercises.find(e => e.name === upperName && e.workout_type === workout_type);
            if (exists) {
                return res.status(400).json({ detail: "Exercise already exists in the database" });
            }
            inMemoryStore.exercises.push({
                id: inMemoryStore.nextExerciseId++,
                name: upperName,
                category: upperCategory,
                workout_type
            });
        } else {
            const exists = await dbPool.query('SELECT id FROM exercises WHERE UPPER(name) = $1 AND workout_type = $2', [upperName, workout_type]);
            if (exists.rows.length > 0) {
                return res.status(400).json({ detail: "Exercise already exists in the database" });
            }
            await dbPool.query(
                'INSERT INTO exercises (name, category, workout_type) VALUES ($1, $2, $3)',
                [upperName, upperCategory, workout_type]
            );
        }
        return res.json({ message: "Exercise added successfully" });
    } catch (err) {
        console.error("Create exercise error:", err);
        return res.status(500).json({ detail: "Could not add exercise" });
    }
});

app.get('/exercises', async (req, res) => {
    const { type } = req.query;

    try {
        if (useInMemory) {
            const filtered = type 
                ? inMemoryStore.exercises.filter(e => e.workout_type.toLowerCase() === type.toLowerCase())
                : inMemoryStore.exercises;
            return res.json(filtered);
        } else {
            let result;
            if (type) {
                result = await dbPool.query('SELECT id, name, category, workout_type FROM exercises WHERE LOWER(workout_type) = LOWER($1)', [type]);
            } else {
                result = await dbPool.query('SELECT id, name, category, workout_type FROM exercises');
            }
            return res.json(result.rows);
        }
    } catch (err) {
        console.error("Get exercises error:", err);
        return res.status(500).json({ detail: "Could not fetch exercises" });
    }
});

// LOGS
app.post('/logs', async (req, res) => {
    const current_user_id = get_current_user(req);
    if (!current_user_id) {
        return res.status(401).json({ detail: "Not authenticated" });
    }

    const { exercise_id, sets, reps, weight_added } = req.body;
    if (!exercise_id || !sets || !reps) {
        return res.status(400).json({ detail: "Missing exercise_id, sets, or reps" });
    }

    const weight = parseFloat(weight_added) || 0.0;

    try {
        if (useInMemory) {
            inMemoryStore.workout_logs.push({
                id: inMemoryStore.nextLogId++,
                user_id: current_user_id,
                exercise_id: parseInt(exercise_id),
                sets: parseInt(sets),
                reps: parseInt(reps),
                weight_added: weight,
                workout_date: new Date()
            });
        } else {
            await dbPool.query(
                'INSERT INTO workout_logs (user_id, exercise_id, sets, reps, weight_added) VALUES ($1, $2, $3, $4, $5)',
                [current_user_id, parseInt(exercise_id), parseInt(sets), parseInt(reps), weight]
            );
        }
        return res.json({ message: "Workout log saved successfully!" });
    } catch (err) {
        console.error("Create log error:", err);
        return res.status(500).json({ detail: "Could not save workout log" });
    }
});

app.get('/logs', async (req, res) => {
    const current_user_id = get_current_user(req);
    if (!current_user_id) {
        // Return mock guest logs if browsing as Guest, so UI has active workout visual feedback
        const guestLogs = [
            { id: 1, exercise_name: "PULL-UP", category: "BACK", date: new Date().toISOString(), sets: 3, reps: 8, weight_added: 0, workout_type: "Calisthenics" }
        ];
        return res.json(guestLogs);
    }

    const type = req.query.type;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
        if (useInMemory) {
            let logs = inMemoryStore.workout_logs
                .filter(log => log.user_id === current_user_id)
                .map(log => {
                    const ex = inMemoryStore.exercises.find(e => e.id === log.exercise_id);
                    return {
                        id: log.id,
                        exercise_name: ex ? ex.name : "UNKNOWN EXERCISE",
                        category: ex ? ex.category : "GENERAL",
                        date: log.workout_date.toISOString(),
                        sets: log.sets,
                        reps: log.reps,
                        weight_added: log.weight_added,
                        workout_type: ex ? ex.workout_type : "Calisthenics"
                    };
                });
            if (type) {
                logs = logs.filter(log => log.workout_type.toLowerCase() === type.toLowerCase());
            }
            // Sort by date desc
            logs.sort((a, b) => new Date(b.date) - new Date(a.date));
            return res.json(logs.slice(offset, offset + limit));
        } else {
            let query = `
                SELECT wl.id, e.name, e.category, wl.workout_date, wl.sets, wl.reps, wl.weight_added, e.workout_type
                FROM workout_logs wl
                JOIN exercises e ON wl.exercise_id = e.id
                WHERE wl.user_id = $1
            `;
            const params = [current_user_id];
            
            if (type) {
                params.push(type);
                query += ` AND e.workout_type = $${params.length}`;
            }

            params.push(limit);
            query += ` ORDER BY wl.workout_date DESC LIMIT $${params.length}`;
            params.push(offset);
            query += ` OFFSET $${params.length}`;

            const result = await dbPool.query(query, params);
            const logs = result.rows.map(row => ({
                id: row.id,
                exercise_name: row.name,
                category: row.category,
                date: row.workout_date.toISOString(),
                sets: row.sets,
                reps: row.reps,
                weight_added: parseFloat(row.weight_added),
                workout_type: row.workout_type
            }));
            return res.json(logs);
        }
    } catch (err) {
        console.error("Get logs error:", err);
        return res.status(500).json({ detail: "Could not fetch workout logs" });
    }
});

app.delete('/logs/:log_id', async (req, res) => {
    const current_user_id = get_current_user(req);
    if (!current_user_id) {
        return res.status(401).json({ detail: "Not authenticated" });
    }

    const logId = parseInt(req.params.log_id);

    try {
        if (useInMemory) {
            const index = inMemoryStore.workout_logs.findIndex(log => log.id === logId && log.user_id === current_user_id);
            if (index === -1) {
                return res.status(404).json({ detail: "Workout log not found or unauthorized" });
            }
            inMemoryStore.workout_logs.splice(index, 1);
        } else {
            const exists = await dbPool.query('SELECT id FROM workout_logs WHERE id = $1 AND user_id = $2', [logId, current_user_id]);
            if (exists.rows.length === 0) {
                return res.status(404).json({ detail: "Workout log not found or unauthorized" });
            }
            await dbPool.query('DELETE FROM workout_logs WHERE id = $1', [logId]);
        }
        return res.json({ message: "Log deleted successfully" });
    } catch (err) {
        console.error("Delete log error:", err);
        return res.status(500).json({ detail: "Could not delete workout log" });
    }
});

// ANALYTICS
app.get('/analytics', async (req, res) => {
    const current_user_id = get_current_user(req);
    if (!current_user_id) {
        // Return default guest metrics
        const defaultLabels = [];
        const defaultVolume = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            defaultLabels.push(d.toISOString().split('T')[0]);
            defaultVolume.push(i === 3 ? 24 : i === 1 ? 96 : 0);
        }
        return res.json({ labels: defaultLabels, volume: defaultVolume });
    }

    try {
        if (useInMemory) {
            const labels = [];
            const volume = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayStr = d.toISOString().split('T')[0];
                labels.push(dayStr);

                // calculate volume for user on this day
                const dayLogs = inMemoryStore.workout_logs.filter(log => {
                    if (log.user_id !== current_user_id) return false;
                    const logDayStr = log.workout_date.toISOString().split('T')[0];
                    return logDayStr === dayStr;
                });

                let dayVol = 0;
                dayLogs.forEach(log => {
                    const wt = log.weight_added > 0 ? log.weight_added : 1;
                    dayVol += log.sets * log.reps * wt;
                });
                volume.push(dayVol);
            }
            return res.json({ labels, volume });
        } else {
            const query = `
                WITH date_series AS (
                    SELECT generate_series(
                        CURRENT_DATE - INTERVAL '6 days',
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    )::DATE AS log_date
                ),
                daily_volume AS (
                    SELECT
                        CAST(workout_date AS DATE) AS log_date,
                        SUM(sets * reps * CASE WHEN COALESCE(weight_added, 0) > 0 THEN weight_added ELSE 1 END) AS total_volume
                    FROM workout_logs
                    WHERE user_id = $1
                      AND workout_date >= CURRENT_DATE - INTERVAL '6 days'
                    GROUP BY CAST(workout_date AS DATE)
                )
                SELECT ds.log_date, COALESCE(dv.total_volume, 0) AS total_volume
                FROM date_series ds
                LEFT JOIN daily_volume dv ON ds.log_date = dv.log_date
                ORDER BY ds.log_date ASC;
            `;
            const result = await dbPool.query(query, [current_user_id]);
            const labels = result.rows.map(row => row.log_date.toISOString().split('T')[0]);
            const volume = result.rows.map(row => parseFloat(row.total_volume));
            return res.json({ labels, volume });
        }
    } catch (err) {
        console.error("Analytics error:", err);
        return res.status(500).json({ detail: "Could not calculate analytics" });
    }
});

// ---- CHATBOT ENDPOINT ----
app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) {
        return res.status(400).json({ error: "Missing message parameter." });
    }

    console.log(`Received message from client: "${message}"`);

    // If Gemini Client is available, query Gemini!
    if (aiClient) {
        try {
            // Map the simple history format to the Gemini SDK contents structure
            // history: Array of { role: 'user'|'model', text: '...' }
            const contents = [];
            if (history && Array.isArray(history)) {
                history.forEach(item => {
                    contents.push({
                        role: item.role === 'model' ? 'model' : 'user',
                        parts: [{ text: item.text }]
                    });
                });
            }
            // Append the latest user message
            contents.push({
                role: 'user',
                parts: [{ text: message }]
            });

            const systemInstruction = `You are APEX AI, an elite calisthenics coach and personal gym trainer. 
Your goal is to provide specific, professional, and science-backed training advice, calculate 1-Rep Maxes, offer progression advice for handstands, muscle-ups, pull-ups, and lifting workouts.
When asked to perform calculations (e.g. 1RM, calories, target heart rate), explain your formulas precisely and provide clean, readable tables or step-by-step math.
Be extremely encouraging, concise, and professional. Use beautiful, structured markdown spacing. Do NOT use emojis excessively, but keep a premium fitness feel.`;

            const response = await aiClient.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: contents,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7
                }
            });

            const textResponse = response.text || "I apologize, but I received an empty response. Let me try that again.";
            return res.json({ text: textResponse });
        } catch (err) {
            console.error("Gemini model generation error:", err);
            return res.status(500).json({ error: "Gemini AI generation failed. Fallback to in-memory guidance.", details: err.message });
        }
    }

    // Fallback Mock chatbot logic if API key not present
    let reply = "Hello! I am APEX AI. To start chatting with Gemini intelligence, please define your GEMINI_API_KEY in Settings > Secrets. In the meantime, I can calculate your 1-Rep Max if you tell me your weight and reps!";
    const msgUpper = message.toUpperCase();
    if (msgUpper.includes("1RM") || msgUpper.includes("ONE REP MAX") || msgUpper.includes("CALCULATE")) {
        reply = "To calculate your 1-Rep Max (1RM), you can use the Epley formula: **1RM = w * (1 + r / 30)**. For example, if you lift 100 kg for 5 reps, your estimated 1RM is: 100 * (1 + 5/30) = **116.7 kg**. Try telling me a weight and reps and I can compute it!";
    } else if (msgUpper.includes("PULLUP") || msgUpper.includes("PULL-UP") || msgUpper.includes("REPS")) {
        reply = "To increase pull-up reps, practice sub-maximal high frequency sets (Grease the Groove), incorporate weighted pull-ups to build strength, and do slow controlled negatives to build stamina! Aim for 3 sessions per week.";
    } else if (msgUpper.includes("HELLO") || msgUpper.includes("HI")) {
        reply = "Welcome to APEX AI Coach! Tell me about your training goals today: Are you focusing on calisthenics progressions (like muscle-ups or handstands) or pushing heavy weights?";
    }
    return res.json({ text: reply });
});

// ---- SERVE STATIC FRONTEND FILES ----
app.use(express.static(path.join(__dirname, 'frontend')));

// Fallback to index.html for SPA routes
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ---- START THE SERVER ----
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`APEX Fullstack Server running on port ${PORT}`);
    console.log(`Serving static files from frontend/`);
    console.log(`=================================================`);
});
