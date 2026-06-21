from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
import uuid

from .. import models, schemas, auth_utils
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    print(f"DEBUG: Login attempt for username: '{form_data.username}', password: '{form_data.password}'")
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth_utils.verify_password(form_data.password, user.password_hash):
        print(f"DEBUG: Login failed. User found: {user is not None}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth_utils.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_utils.create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register/student", response_model=schemas.UserResponse)
def register_student(user: schemas.UserCreate, db: Session = Depends(get_db)):
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
        role="student"
    )
    db.add(db_user)
    
    # Create student profile
    class_id = None
    if user.class_code:
        ccode = user.class_code.strip().upper()
        class_group = db.query(models.ClassGroup).filter(models.ClassGroup.code == ccode).first()
        if not class_group:
            class_group = models.ClassGroup(
                id=str(uuid.uuid4()),
                code=ccode,
                name=f"Class {ccode}"
            )
            db.add(class_group)
            db.flush() # flush so class_group has id if needed
        class_id = class_group.id
        
    student_profile = models.StudentProfile(
        user_id=user_id,
        class_code=user.class_code.strip().upper() if user.class_code else None,
        class_id=class_id
    )
    db.add(student_profile)
    db.commit()
    db.refresh(db_user)
    
    return db_user
