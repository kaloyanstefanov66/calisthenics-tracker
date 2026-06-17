import bcrypt
from datetime import datetime, timedelta
import jwt
import os
from dotenv import load_dotenv

# Initialize dotenv so it can read the hidden file
load_dotenv()

# --- SECURITY UPDATE ---!
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 129600  # 90 days in minutes

# Turn plain text password into a secure hash using native bcrypt
def get_password_hash(password: str) -> str:
    # Convert string password to bytes
    password_bytes = password.encode('utf-8')
    # Generate salt and hash it
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    # Return as a string to save easily in PostgreSQL
    return hashed.decode('utf-8')

# Verify if input password matches stored hash
def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)

# Create access token remains exactly the same
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)