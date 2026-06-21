import sqlite3
import os

def migrate():
    db_path = "classroom.db"
    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # 1. Create class_groups table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS class_groups (
        id VARCHAR PRIMARY KEY,
        code VARCHAR UNIQUE,
        name VARCHAR,
        teacher_id VARCHAR,
        created_at DATETIME
    )
    """)
    print("Checked/Created table: class_groups")
    
    # 2. Create board_log_entries table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS board_log_entries (
        id VARCHAR PRIMARY KEY,
        student_id VARCHAR,
        teacher_id VARCHAR,
        content TEXT,
        created_at DATETIME,
        updated_at DATETIME
    )
    """)
    print("Checked/Created table: board_log_entries")
    
    # Function to add column if it doesn't exist
    def add_column_if_not_exists(table, column, col_type):
        cur.execute(f"PRAGMA table_info({table})")
        columns = [c[1] for c in cur.fetchall()]
        if column not in columns:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            print(f"Added column {column} ({col_type}) to table {table}")
        else:
            print(f"Column {column} already exists in table {table}")

    # 3. Add columns to student_profiles
    add_column_if_not_exists("student_profiles", "teacher_id", "VARCHAR")
    add_column_if_not_exists("student_profiles", "class_id", "VARCHAR")
    
    # 4. Add columns to activities
    add_column_if_not_exists("activities", "student_id", "VARCHAR")
    
    # 5. Add columns to progress
    add_column_if_not_exists("progress", "student_response", "TEXT")
    add_column_if_not_exists("progress", "teacher_notes", "TEXT")
    add_column_if_not_exists("progress", "teacher_score", "INTEGER")
    add_column_if_not_exists("progress", "graded_by", "VARCHAR")
    
    conn.commit()
    conn.close()
    print("Database migration completed successfully!")

if __name__ == "__main__":
    migrate()
