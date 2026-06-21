from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from .. import models, schemas, auth_utils
from ..database import get_db

router = APIRouter(prefix="/api/courses", tags=["courses"])

@router.get("/", response_model=List[schemas.CourseResponse])
def get_courses(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_active_user)):
    return db.query(models.Course).offset(skip).limit(limit).all()

@router.post("/", response_model=schemas.CourseResponse)
def create_course(course: schemas.CourseCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Create a new course/program. Accessible by teachers and coordinators."""
    course_id = str(uuid.uuid4())
    db_course = models.Course(
        id=course_id,
        name=course.name,
        level=course.level,
        description=course.description,
        active=course.active
    )
    db.add(db_course)
    db.commit()
    db.refresh(db_course)
    return db_course

@router.post("/{course_id}/enroll")
def enroll_student(course_id: str, student_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Enroll a student in a course. Accessible by teachers and coordinators."""
    student = db.query(models.User).filter(models.User.id == student_id, models.User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    existing = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == student_id,
        models.Enrollment.course_id == course_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student already enrolled")
        
    enrollment = models.Enrollment(id=str(uuid.uuid4()), student_id=student_id, course_id=course_id)
    db.add(enrollment)
    db.commit()
    return {"message": "Enrolled successfully"}

@router.delete("/{course_id}")
def delete_course(course_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_teacher)):
    """Delete a course/program. Accessible by teachers and coordinators."""
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    db.delete(course)
    db.commit()
    return {"message": "Course deleted successfully"}

