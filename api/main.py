from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import os

from . import models, auth_utils
from .database import engine, SessionLocal
from .routes import auth, users, activities, courses, progress, classes, board_logs

# Create DB tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="English Mastery API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development. In prod, specify the origin.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(activities.router)
app.include_router(courses.router)
app.include_router(progress.router)
app.include_router(classes.router)
app.include_router(board_logs.router)

@app.on_event("startup")
def create_initial_coordinator():
    """Create an initial coordinator account if none exists."""
    db = SessionLocal()
    try:
        coordinator = db.query(models.User).filter(models.User.role == "coordinator").first()
        if not coordinator:
            hashed_password = auth_utils.get_password_hash("admin123")
            new_coord = models.User(
                id="coord-001",
                username="admin",
                full_name="System Admin",
                password_hash=hashed_password,
                role="coordinator"
            )
            db.add(new_coord)
            db.commit()
            print("Created default coordinator (admin / admin123)")
    finally:
        db.close()

from fastapi.staticfiles import StaticFiles

app.mount("/", StaticFiles(directory="web", html=True), name="web")
