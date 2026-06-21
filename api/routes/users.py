from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from .. import models, schemas, auth_utils
from ..database import get_db

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth_utils.get_current_active_user)):
    return current_user

@router.get("/", response_model=List[schemas.UserResponse])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_coordinator)):
    users = db.query(models.User).offset(skip).limit(limit).all()
    return users

@router.post("/", response_model=schemas.UserResponse)
def create_staff_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_coordinator)):
    """Create a new teacher or coordinator. Only accessible by coordinators."""
    if user.role not in ["teacher", "coordinator"]:
        raise HTTPException(status_code=400, detail="Role must be 'teacher' or 'coordinator'")
        
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    user_id = str(uuid.uuid4())
    hashed_password = auth_utils.get_password_hash(user.password)
    
    db_user = models.User(
        id=user_id,
        username=user.username,
        full_name=user.full_name,
        password_hash=hashed_password,
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.get("/students", response_model=List[schemas.UserResponse])
def read_students(db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Retrieve students. Coordinators get all; teachers get their assigned students."""
    if current_user.role == "coordinator":
        return db.query(models.User).filter(models.User.role == "student").all()
    else:
        # Teacher: Filter by student_profile.teacher_id
        return db.query(models.User).join(models.StudentProfile).filter(
            models.User.role == "student",
            models.StudentProfile.teacher_id == current_user.id
        ).all()

@router.get("/teachers", response_model=List[schemas.UserResponse])
def read_teachers(db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_active_user)):
    """Retrieve all teachers (accessible by any logged-in user)."""
    return db.query(models.User).filter(models.User.role == "teacher").all()

@router.put("/student/{student_id}/assign-teacher", response_model=schemas.UserResponse)
def assign_teacher(student_id: str, payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_coordinator)):
    """Assign a student to a teacher and/or class group. Coordinators only."""
    student = db.query(models.User).filter(models.User.id == student_id, models.User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == student_id).first()
    if not profile:
        profile = models.StudentProfile(user_id=student_id, current_week=1)
        db.add(profile)
        
    # Read payload keys
    teacher_id = payload.get("teacher_id")
    class_id = payload.get("class_id")
    class_code = payload.get("class_code")
    
    if teacher_id:
        if teacher_id == "none":
            profile.teacher_id = None
        else:
            teacher = db.query(models.User).filter(models.User.id == teacher_id, models.User.role == "teacher").first()
            if not teacher:
                raise HTTPException(status_code=400, detail="Invalid teacher_id")
            profile.teacher_id = teacher_id
        
    if class_id:
        if class_id == "none":
            profile.class_id = None
        else:
            class_group = db.query(models.ClassGroup).filter(models.ClassGroup.id == class_id).first()
            if not class_group:
                raise HTTPException(status_code=400, detail="Invalid class_id")
            profile.class_id = class_id
            profile.class_code = class_group.code
    elif class_code:
        profile.class_code = class_code.strip().upper()
        # Find class group or auto-create it
        class_group = db.query(models.ClassGroup).filter(models.ClassGroup.code == profile.class_code).first()
        if not class_group:
            class_group = models.ClassGroup(
                id=str(uuid.uuid4()),
                code=profile.class_code,
                name=f"Class {profile.class_code}"
            )
            db.add(class_group)
            db.commit()
        profile.class_id = class_group.id
        
    db.commit()
    db.refresh(student)
    return student
