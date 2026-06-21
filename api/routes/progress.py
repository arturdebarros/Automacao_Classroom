from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from .. import models, schemas, auth_utils
from ..database import get_db

router = APIRouter(prefix="/api/progress", tags=["progress"])

@router.post("/", response_model=schemas.ProgressResponse)
def submit_progress(progress: schemas.ProgressCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_active_user)):
    """Student submits completion of an activity slot."""
    if current_user.role != "student":
        raise HTTPException(status_code=400, detail="Only students can submit progress")
        
    existing = db.query(models.Progress).filter(
        models.Progress.student_id == current_user.id,
        models.Progress.week_num == progress.week_num,
        models.Progress.slot_num == progress.slot_num
    ).first()
    
    if existing:
        # If student is resubmitting with a new response, update it
        if progress.student_response is not None:
            existing.student_response = progress.student_response
            db.commit()
            db.refresh(existing)
        return existing
        
    new_progress = models.Progress(
        id=str(uuid.uuid4()),
        student_id=current_user.id,
        week_num=progress.week_num,
        slot_num=progress.slot_num,
        skill_area=progress.skill_area,
        student_response=progress.student_response,
        score=10 # Base XP per activity
    )
    db.add(new_progress)
    db.commit()
    db.refresh(new_progress)
    return new_progress

@router.get("/me", response_model=List[schemas.ProgressResponse])
def get_my_progress(db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_active_user)):
    """Get all progress for the current student."""
    if current_user.role != "student":
        raise HTTPException(status_code=400, detail="Only applicable for students")
        
    return db.query(models.Progress).filter(models.Progress.student_id == current_user.id).all()

@router.get("/student/{student_id}", response_model=List[schemas.ProgressResponse])
def get_student_progress(student_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Teachers and coordinators can view a specific student's progress."""
    # If teacher, verify they are assigned to this student
    if current_user.role == "teacher":
        profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == student_id).first()
        if not profile or profile.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this student's progress")
            
    return db.query(models.Progress).filter(models.Progress.student_id == student_id).all()

@router.put("/{progress_id}/grade", response_model=schemas.ProgressResponse)
def grade_progress(progress_id: str, payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Teacher/Coordinator grades a student's activity submission."""
    progress_item = db.query(models.Progress).filter(models.Progress.id == progress_id).first()
    if not progress_item:
        raise HTTPException(status_code=404, detail="Progress record not found")
        
    # If teacher, verify they are assigned to this student
    if current_user.role == "teacher":
        profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == progress_item.student_id).first()
        if not profile or profile.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to grade this student's work")
            
    progress_item.teacher_notes = payload.get("teacher_notes")
    progress_item.teacher_score = payload.get("teacher_score")
    progress_item.graded_by = current_user.id
    
    db.commit()
    db.refresh(progress_item)
    return progress_item
