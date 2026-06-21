from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
import datetime

from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    full_name = Column(String)
    role = Column(String) # 'student', 'teacher', 'coordinator'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    student_profile = relationship("StudentProfile", back_populates="user", uselist=False, foreign_keys="StudentProfile.user_id")
    enrollments = relationship("Enrollment", back_populates="student")
    activities_created = relationship("Activity", back_populates="author", foreign_keys="Activity.author_id")

class ClassGroup(Base):
    __tablename__ = "class_groups"

    id = Column(String, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    name = Column(String)
    teacher_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    students = relationship("StudentProfile", back_populates="class_group")
    teacher = relationship("User")

class StudentProfile(Base):
    __tablename__ = "student_profiles"
    
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    class_code = Column(String, index=True)
    current_week = Column(Integer, default=1)
    
    # New Columns
    teacher_id = Column(String, ForeignKey("users.id"), nullable=True)
    class_id = Column(String, ForeignKey("class_groups.id"), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="student_profile", foreign_keys=[user_id])
    teacher = relationship("User", foreign_keys=[teacher_id])
    class_group = relationship("ClassGroup", back_populates="students", foreign_keys=[class_id])

class Course(Base):
    __tablename__ = "courses"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    level = Column(String)
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    enrollments = relationship("Enrollment", back_populates="course")

class Enrollment(Base):
    __tablename__ = "enrollments"
    
    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("users.id"))
    course_id = Column(String, ForeignKey("courses.id"))
    enrolled_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    student = relationship("User", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")

class Activity(Base):
    __tablename__ = "activities"
    
    id = Column(String, primary_key=True, index=True)
    title = Column(String)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    type = Column(String) # 'text', 'audio', 'speaking_prompt', 'writing_prompt'
    area = Column(String) # 'grammar', 'listening', 'speaking', etc.
    published = Column(Boolean, default=False)
    
    # 52-week curriculum mapping
    week_num = Column(Integer, nullable=True)
    slot_num = Column(Integer, nullable=True)
    
    author_id = Column(String, ForeignKey("users.id"))
    course_id = Column(String, ForeignKey("courses.id"), nullable=True) # If null, applies globally
    student_id = Column(String, ForeignKey("users.id"), nullable=True) # If set, custom for specific student
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    author = relationship("User", back_populates="activities_created", foreign_keys=[author_id])

class Progress(Base):
    __tablename__ = "progress"
    
    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("users.id"))
    
    # Track completion by week/slot for the 52-week curriculum
    week_num = Column(Integer, nullable=True)
    slot_num = Column(Integer, nullable=True)
    skill_area = Column(String, nullable=True)
    
    completed_at = Column(DateTime, default=datetime.datetime.utcnow)
    score = Column(Integer, default=0) # e.g. XP gained
    
    # New Columns
    student_response = Column(Text, nullable=True)
    teacher_notes = Column(Text, nullable=True)
    teacher_score = Column(Integer, nullable=True)
    graded_by = Column(String, ForeignKey("users.id"), nullable=True)

class BoardLogEntry(Base):
    __tablename__ = "board_log_entries"
    
    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("users.id"))
    teacher_id = Column(String, ForeignKey("users.id"))
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    student = relationship("User", foreign_keys=[student_id])
    teacher = relationship("User", foreign_keys=[teacher_id])
