from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from .. import models, schemas, auth_utils
from ..database import get_db

router = APIRouter(prefix="/api/board-logs", tags=["board-logs"])

@router.get("/student/{student_id}", response_model=List[schemas.BoardLogResponse])
def get_student_board_logs(student_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_active_user)):
    # Verify authorization: student can view their own, assigned teacher or coordinator can view.
    if current_user.role == "student" and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="Not authorized to view other student's board logs")
        
    if current_user.role == "teacher":
        profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == student_id).first()
        if not profile or profile.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this student's board logs")
            
    # Coordinators and authorised users can query
    return db.query(models.BoardLogEntry).filter(models.BoardLogEntry.student_id == student_id).order_by(models.BoardLogEntry.created_at.desc()).all()

@router.post("/", response_model=schemas.BoardLogResponse)
def create_board_log(log_data: schemas.BoardLogCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    # Check if student exists
    student = db.query(models.User).filter(models.User.id == log_data.student_id, models.User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    if current_user.role == "teacher":
        profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == log_data.student_id).first()
        if not profile or profile.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="Can only log for your assigned students")
            
    new_entry = models.BoardLogEntry(
        id=str(uuid.uuid4()),
        student_id=log_data.student_id,
        teacher_id=current_user.id,
        content=log_data.content.strip()
    )
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    return new_entry

@router.put("/{entry_id}", response_model=schemas.BoardLogResponse)
def update_board_log(entry_id: str, log_data: schemas.BoardLogCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    entry = db.query(models.BoardLogEntry).filter(models.BoardLogEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Log entry not found")
        
    if current_user.role == "teacher" and entry.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this log entry")
        
    entry.content = log_data.content.strip()
    db.commit()
    db.refresh(entry)
    return entry

@router.delete("/{entry_id}")
def delete_board_log(entry_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    entry = db.query(models.BoardLogEntry).filter(models.BoardLogEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Log entry not found")
        
    if current_user.role == "teacher" and entry.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this log entry")
        
    db.delete(entry)
    db.commit()
    return {"message": "Log entry deleted successfully"}
