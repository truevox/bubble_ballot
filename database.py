import sqlite3
import datetime

DB_NAME = "board.db"

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_slug TEXT NOT NULL,
            content TEXT NOT NULL,
            votes INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def add_question(board_slug, content):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('INSERT INTO questions (board_slug, content) VALUES (?, ?)',
                (board_slug, content))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id

def get_questions(board_slug):
    conn = get_db_connection()
    questions = conn.execute('SELECT * FROM questions WHERE board_slug = ? ORDER BY votes DESC, created_at DESC',
                             (board_slug,)).fetchall()
    conn.close()
    return [dict(q) for q in questions]

def vote_question(question_id, amount=1, board_slug=None):
    conn = get_db_connection()
    update_query = 'UPDATE questions SET votes = votes + ? WHERE id = ?'
    select_query = 'SELECT votes FROM questions WHERE id = ?'
    update_params = (amount, question_id)
    select_params = (question_id,)

    if board_slug:
        update_query += ' AND board_slug = ?'
        select_query += ' AND board_slug = ?'
        update_params += (board_slug,)
        select_params += (board_slug,)

    conn.execute(update_query, update_params)
    row = conn.execute(select_query, select_params).fetchone()
    conn.commit()
    conn.close()
    return row['votes'] if row else None

def get_recent_boards():
    conn = get_db_connection()
    boards = conn.execute('''
        SELECT board_slug
        FROM questions
        GROUP BY board_slug
        ORDER BY MAX(created_at) DESC
        LIMIT 3
    ''').fetchall()
    conn.close()
    return [dict(b)['board_slug'] for b in boards]

def search_questions(board_slug, query, limit=10):
    conn = get_db_connection()
    query = f"%{query}%"
    questions = conn.execute('SELECT * FROM questions WHERE board_slug = ? AND content LIKE ? ORDER BY votes DESC, created_at DESC LIMIT ?',
                             (board_slug, query, limit)).fetchall()
    conn.close()
    return [dict(q) for q in questions]

# Initialize DB on import (safe if already exists)
init_db()
