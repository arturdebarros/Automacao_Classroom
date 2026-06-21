from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from .. import models, schemas, auth_utils
from ..database import get_db

router = APIRouter(prefix="/api/activities", tags=["activities"])

@router.get("/", response_model=List[schemas.ActivityResponse])
def get_activities(course_id: Optional[str] = None, student_id: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_active_user)):
    """Get all activities, optionally filtered by course."""
    query = db.query(models.Activity)
    if course_id:
        query = query.filter(models.Activity.course_id == course_id)
        
    # Students only see published activities that are either global or assigned specifically to them
    if current_user.role == "student":
        query = query.filter(
            models.Activity.published == True,
            (models.Activity.student_id == None) | (models.Activity.student_id == current_user.id)
        )
    else:
        if student_id:
            query = query.filter(models.Activity.student_id == student_id)
        
    return query.all()

@router.post("/", response_model=schemas.ActivityResponse)
def create_activity(activity: schemas.ActivityCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Create a new activity. Teachers and coordinators only."""
    activity_id = str(uuid.uuid4())
    db_activity = models.Activity(
        id=activity_id,
        title=activity.title,
        description=activity.description,
        content=activity.content,
        type=activity.type,
        area=activity.area,
        published=activity.published,
        week_num=activity.week_num,
        slot_num=activity.slot_num,
        course_id=activity.course_id,
        student_id=activity.student_id,
        author_id=current_user.id
    )
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    return db_activity

@router.put("/{activity_id}", response_model=schemas.ActivityResponse)
def update_activity(activity_id: str, updates: schemas.ActivityBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Update an activity."""
    db_activity = db.query(models.Activity).filter(models.Activity.id == activity_id).first()
    if not db_activity:
        raise HTTPException(status_code=404, detail="Activity not found")
        
    for key, value in updates.model_dump().items():
        setattr(db_activity, key, value)
        
    db.commit()
    db.refresh(db_activity)
    return db_activity
