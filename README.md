# APEX — Calisthenics & Gym Workout Tracker

APEX is a workout tracker for calisthenics and gym training. It lets you log sets, reps, and weight, keep a full training history, and visualize your progress over time.

**Live app:** https://calisthenics-tracker-frontend.vercel.app/

## Overview

- Log workouts for both calisthenics (bodyweight) and free weights (gym) exercises
- Track sets, reps, and optional added weight
- View training history, volume analytics, and progress over time
- Email/password and Google sign-in
- Built-in AI coach that gives advice based on your logged training history

## Technologies Used

- **Backend:** Python, FastAPI (SQLAlchemy, JWT auth, rate limiting)
- **Frontend:** JavaScript, HTML, CSS
- **Database:** PostgreSQL

## Project Structure

```
calisthenics-tracker/
├── backend/       # FastAPI app (auth, exercises, logs, analytics, AI coach)
└── frontend/       # Static JS/HTML/CSS client
```

## Getting Started

Clone the repository:

```bash
git clone https://github.com/kaloyanstefanov66/calisthenics-tracker.git
cd calisthenics-tracker
```

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in `backend/` with:

```
DATABASE_URL=postgresql://...
JWT_SECRET_KEY=your_secret_key
JWT_ALGORITHM=HS256
GROQ_API_KEY=your_groq_key   # optional, needed for the AI coach
```

Run the API:

```bash
uvicorn main:app --reload
```

### Frontend

Open `frontend/index.html` directly, or serve the folder with any static server.

## License

MIT
