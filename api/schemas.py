from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# --- Auth & Tokens ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

# --- Student Profile Response ---
class StudentProfileResponse(BaseModel):
    class_code: Optional[str] = None
    current_week: int
    teacher_id: Optional[str] = None
    class_id: Optional[str] = None
    
    class Config:
        from_attributes = True

# --- User Schemas ---
class UserBase(BaseModel):
    username: str
    full_name: str
    role: str

class UserCreate(UserBase):
    password: str
    class_code: Optional[str] = None # For students

class UserResponse(UserBase):
    id: str
    created_at: datetime
    student_profile: Optional[StudentProfileResponse] = None
    
    class Config:
        from_attributes = True

# --- Class Group Schemas ---
class ClassGroupBase(BaseModel):
    code: str
    name: str
    teacher_id: Optional[str] = None

class ClassGroupCreate(ClassGroupBase):
    pass

class ClassGroupResponse(ClassGroupBase):
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- Course Schemas ---
class CourseBase(BaseModel):
    name: str
    level: str
    description: Optional[str] = None
    active: bool = True

class CourseCreate(CourseBase):
    pass

class CourseResponse(CourseBase):
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- Activity Schemas ---
class ActivityBase(BaseModel):
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    type: str
    area: str
    published: bool = False
    week_num: Optional[int] = None
    slot_num: Optional[int] = None
    course_id: Optional[str] = None
    student_id: Optional[str] = None # New field

class ActivityCreate(ActivityBase):
    pass

class ActivityResponse(ActivityBase):
    id: str
    author_id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# --- Progress Schemas ---
class ProgressCreate(BaseModel):
    week_num: int
    slot_num: int
    skill_area: str
    student_response: Optional[str] = None # New field

class ProgressResponse(BaseModel):
    id: str
    student_id: str
    week_num: int
    slot_num: int
    skill_area: str
    completed_at: datetime
    score: int
    student_response: Optional[str] = None # New field
    teacher_notes: Optional[str] = None # New field
    teacher_score: Optional[int] = None # New field
    graded_by: Optional[str] = None # New field
    
    class Config:
        from_attributes = True

# --- Board Log Schemas ---
class BoardLogCreate(BaseModel):
    student_id: str
    content: str

class BoardLogResponse(BaseModel):
    id: str
    student_id: str
    teacher_id: str
    content: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
