from fastapi import FastAPI, Depends, HTTPException, status, Request, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, EmailStr
import os
from dotenv import load_dotenv

# Load env vars once at the top — removed duplicate call
load_dotenv()

import database
import auth
import jwt

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

app = FastAPI(title="Calisthenics & Gym Tracker API")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5550",
        "http://127.0.0.1:5550",
        "https://calisthenics-tracker-frontend.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Detect production so we can set secure=True on cookies only on HTTPS
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"

class AnalyticsResponse(BaseModel):
    labels: list[str]
    volume: list[float]

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class WorkoutLogCreate(BaseModel):
    exercise_id: int
    sets: int
    reps: int
    weight_added: float = 0.0

class GoogleAuthToken(BaseModel):
    token: str

class ExerciseCreate(BaseModel):
    name: str
    category: str
    workout_type: str

# ---- AUTH DEPENDENCIES ----

def get_current_user(access_token: str = Cookie(None)):
    if access_token is None:
        raise HTTPException(status_code=401, detail="Missing authentication cookie")
    try:
        token = access_token.replace("Bearer ", "")
        SECRET_KEY = os.getenv("JWT_SECRET_KEY")
        ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return user_id
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

# FIX: now uses Cookie via get_current_user (was using oauth2_scheme/Bearer header,
# which never matched the cookie the frontend sends — admin inject always returned 403)
def get_admin_user(
    db: Session = Depends(database.get_db),
    current_user_id: int = Depends(get_current_user)
):
    user = db.execute(
        text("SELECT is_admin FROM users WHERE id = :uid"),
        {"uid": current_user_id}
    ).fetchone()
    if not user or not user[0]:
        raise HTTPException(status_code=403, detail="Access Denied: Admin privileges required")
    return current_user_id

# ---- ENDPOINTS ----

@app.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(
    db: Session = Depends(database.get_db),
    current_user_id: int = Depends(get_current_user)
):
    # FIX: was LIMIT 7 with no date filter — returned the 7 days that had logs,
    # skipping gaps. Now generates a full 7-day calendar series and LEFT JOINs
    # actual volume so missing days show as 0 (matching guest chart behaviour).
    query = text("""
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
            WHERE user_id = :user_id
              AND workout_date >= CURRENT_DATE - INTERVAL '6 days'
            GROUP BY CAST(workout_date AS DATE)
        )
        SELECT ds.log_date, COALESCE(dv.total_volume, 0) AS total_volume
        FROM date_series ds
        LEFT JOIN daily_volume dv ON ds.log_date = dv.log_date
        ORDER BY ds.log_date ASC;
    """)
    result = db.execute(query, {"user_id": current_user_id}).fetchall()
    labels = [str(row[0]) for row in result]
    volume = [float(row[1]) for row in result]
    return {"labels": labels, "volume": volume}

@app.post("/register")
def register_user(user_data: UserRegister, db: Session = Depends(database.get_db)):
    existing_user = db.execute(
        text("SELECT id FROM users WHERE username = :uname OR email = :uemail"),
        {"uname": user_data.username, "uemail": user_data.email}
    ).fetchone()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or Email already registered")
    hashed_pwd = auth.get_password_hash(user_data.password)
    db.execute(
        text("INSERT INTO users (username, email, hashed_password) VALUES (:uname, :uemail, :hpwd)"),
        {"uname": user_data.username, "uemail": user_data.email, "hpwd": hashed_pwd}
    )
    db.commit()
    return {"message": "User registered successfully!"}

@app.post("/login")
@limiter.limit("5/minute")
def login_user(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db)
):
    user = db.execute(
        text("SELECT id, username, hashed_password, is_admin FROM users WHERE username = :uname"),
        {"uname": form_data.username}
    ).fetchone()
    if not user or not auth.verify_password(form_data.password, user[2]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = auth.create_access_token(data={"sub": user[1], "user_id": user[0]})
    
    # 🔥 FIXED: samesite="none" forced for Cross-Domain support
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        max_age=7776000,
        expires=7776000,
        samesite="none",      
        secure=IS_PRODUCTION
    )
    return {
        "message": "Authentication successful",
        "is_admin": bool(user[3]),
        "username": user[1]
    }

@app.post("/auth/google")
@limiter.limit("10/minute")
def google_auth(
    request: Request,
    response: Response,
    data: GoogleAuthToken,
    db: Session = Depends(database.get_db)
):
    try:
        CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
        idinfo = id_token.verify_oauth2_token(data.token, google_requests.Request(), CLIENT_ID)
        email = idinfo['email']
        username = idinfo.get('given_name', email.split('@')[0])
        user = db.execute(
            text("SELECT id, username, is_admin FROM users WHERE email = :email"),
            {"email": email}
        ).fetchone()
        if not user:
            db.execute(
                text("INSERT INTO users (username, email, hashed_password, is_admin) VALUES (:uname, :uemail, :hpwd, FALSE)"),
                {"uname": username, "uemail": email, "hpwd": "GOOGLE_SSO_USER"}
            )
            db.commit()
            user = db.execute(
                text("SELECT id, username, is_admin FROM users WHERE email = :email"),
                {"email": email}
            ).fetchone()
        access_token = auth.create_access_token(data={"sub": user[1], "user_id": user[0]})
        
        # 🔥 FIXED: samesite="none" forced for Cross-Domain support
        response.set_cookie(
            key="access_token",
            value=f"Bearer {access_token}",
            httponly=True,
            max_age=7776000,
            expires=7776000,
            samesite="none",      
            secure=IS_PRODUCTION
        )
        return {
            "message": "Authentication successful",
            "is_admin": bool(user[2]),
            "username": user[1]
        }
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google authentication token")

@app.post("/exercises")
def create_exercise(
    exercise_data: ExerciseCreate,
    db: Session = Depends(database.get_db),
    admin_id: int = Depends(get_admin_user)
):
    existing = db.execute(
        text("SELECT id FROM exercises WHERE name = :name AND workout_type = :wtype"),
        {"name": exercise_data.name.upper(), "wtype": exercise_data.workout_type}
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Exercise already exists in the database")
    db.execute(
        text("INSERT INTO exercises (name, category, workout_type) VALUES (:name, :category, :wtype)"),
        {
            "name": exercise_data.name.upper(),
            "category": exercise_data.category.upper(),
            "wtype": exercise_data.workout_type
        }
    )
    db.commit()
    return {"message": "Exercise added successfully"}

@app.get("/exercises")
def get_exercises(type: str = None, db: Session = Depends(database.get_db)):
    if type:
        result = db.execute(
            text("SELECT id, name, category, workout_type FROM exercises WHERE workout_type = :wtype"),
            {"wtype": type}
        ).fetchall()
    else:
        result = db.execute(text("SELECT id, name, category, workout_type FROM exercises")).fetchall()
    return [{"id": row[0], "name": row[1], "category": row[2], "workout_type": row[3]} for row in result]

@app.post("/logs")
def create_workout_log(
    log_data: WorkoutLogCreate,
    db: Session = Depends(database.get_db),
    current_user_id: int = Depends(get_current_user)
):
    db.execute(
        text("""
            INSERT INTO workout_logs (user_id, exercise_id, sets, reps, weight_added)
            VALUES (:uid, :eid, :sets, :reps, :weight)
        """),
        {
            "uid": current_user_id,
            "eid": log_data.exercise_id,
            "sets": log_data.sets,
            "reps": log_data.reps,
            "weight": log_data.weight_added
        }
    )
    db.commit()
    return {"message": "Workout log saved successfully!"}

@app.get("/logs")
def get_user_logs(
    type: str = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(database.get_db),
    current_user_id: int = Depends(get_current_user)
):
    # Added LIMIT/OFFSET so large histories don't load everything at once
    query = """
        SELECT wl.id, e.name, e.category, wl.workout_date, wl.sets, wl.reps, wl.weight_added, e.workout_type
        FROM workout_logs wl
        JOIN exercises e ON wl.exercise_id = e.id
        WHERE wl.user_id = :uid
    """
    params = {"uid": current_user_id, "limit": min(limit, 100), "offset": offset}
    if type:
        query += " AND e.workout_type = :wtype"
        params["wtype"] = type
    query += " ORDER BY wl.workout_date DESC LIMIT :limit OFFSET :offset"
    result = db.execute(text(query), params).fetchall()
    return [
        {
            "id": row[0],
            "exercise_name": row[1],
            "category": row[2],
            "date": str(row[3]),
            "sets": row[4],
            "reps": row[5],
            "weight_added": float(row[6]),
            "workout_type": row[7]
        }
        for row in result
    ]

@app.delete("/logs/{log_id}")
def delete_workout_log(
    log_id: int,
    db: Session = Depends(database.get_db),
    current_user_id: int = Depends(get_current_user)
):
    log = db.execute(
        text("SELECT id FROM workout_logs WHERE id = :lid AND user_id = :uid"),
        {"lid": log_id, "uid": current_user_id}
    ).fetchone()
    if not log:
        raise HTTPException(status_code=404, detail="Workout log not found or unauthorized")
    db.execute(
        text("DELETE FROM workout_logs WHERE id = :lid"),
        {"lid": log_id}
    )
    db.commit()
    return {"message": "Log deleted successfully"}