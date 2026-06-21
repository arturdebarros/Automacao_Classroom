from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from .. import models, schemas, auth_utils
from ..database import get_db

router = APIRouter(prefix="/api/classes", tags=["classes"])

@router.get("/", response_model=List[schemas.ClassGroupResponse])
def get_classes(db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_active_user)):
    if current_user.role == "coordinator":
        return db.query(models.ClassGroup).all()
    elif current_user.role == "teacher":
        return db.query(models.ClassGroup).filter(models.ClassGroup.teacher_id == current_user.id).all()
    else:
        # Students see only their class group
        profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == current_user.id).first()
        if profile and profile.class_id:
            return db.query(models.ClassGroup).filter(models.ClassGroup.id == profile.class_id).all()
        return []

@router.post("/", response_model=schemas.ClassGroupResponse)
def create_class(class_data: schemas.ClassGroupCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    existing = db.query(models.ClassGroup).filter(models.ClassGroup.code == class_data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Class code already exists")
        
    teacher_id = class_data.teacher_id if current_user.role == "coordinator" else current_user.id
    
    new_class = models.ClassGroup(
        id=str(uuid.uuid4()),
        code=class_data.code.strip().upper(),
        name=class_data.name.strip(),
        teacher_id=teacher_id
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    return new_class

@router.put("/{class_id}", response_model=schemas.ClassGroupResponse)
def update_class(class_id: str, class_data: schemas.ClassGroupCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    cls = db.query(models.ClassGroup).filter(models.ClassGroup.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
        
    # Teachers can only update their own classes
    if current_user.role == "teacher" and cls.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this class")
        
    existing = db.query(models.ClassGroup).filter(models.ClassGroup.code == class_data.code, models.ClassGroup.id != class_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Class code already exists")
        
    cls.code = class_data.code.strip().upper()
    cls.name = class_data.name.strip()
    if current_user.role == "coordinator":
        cls.teacher_id = class_data.teacher_id
        
    db.commit()
    db.refresh(cls)
    return cls

@router.delete("/{class_id}")
def delete_class(class_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    cls = db.query(models.ClassGroup).filter(models.ClassGroup.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
        
    if current_user.role == "teacher" and cls.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this class")
        
    db.delete(cls)
    db.commit()
    return {"message": "Class deleted successfully"}
