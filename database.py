import sqlite3
import datetime
import random

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
    if board_slug == 'testing':
        pre_populate_testing_board()

    conn = get_db_connection()
    questions = conn.execute('SELECT * FROM questions WHERE board_slug = ? ORDER BY votes DESC, created_at DESC',
                             (board_slug,)).fetchall()
    conn.close()
    return [dict(q) for q in questions]


def pre_populate_testing_board():
    conn = get_db_connection()
    # Clear existing testing questions
    conn.execute("DELETE FROM questions WHERE board_slug = 'testing'")

    questions = [
        "To be?",
        "Or not to be?",
        "If not, why not?",
        "Just because?",
        "MOAR BUBBLES!!!"
    ]
    random.shuffle(questions)

    # One gets 0 votes
    conn.execute("INSERT INTO questions (board_slug, content, votes) VALUES ('testing', ?, 0)", (questions.pop(),))

    # One gets 201-400 votes
    conn.execute("INSERT INTO questions (board_slug, content, votes) VALUES ('testing', ?, ?)",
                 (questions.pop(), random.randint(201, 400)))

    # The rest get 10-120
    for q_content in questions:
        conn.execute("INSERT INTO questions (board_slug, content, votes) VALUES ('testing', ?, ?)",
                     (q_content, random.randint(10, 120)))

    conn.commit()
    conn.close()

def vote_question(question_id, amount=1):
    conn = get_db_connection()
    conn.execute('UPDATE questions SET votes = votes + ? WHERE id = ?', (amount, question_id))
    conn.commit()

    # Fetch updated vote count
    row = conn.execute('SELECT votes FROM questions WHERE id = ?', (question_id,)).fetchone()
    conn.close()
    return row['votes'] if row else None


def get_recent_boards():
    conn = get_db_connection()
    # DISTINCT ON is not available in sqlite, so we do it in two steps
    # First, get the most recent timestamp for each board_slug
    # Then, get the board_slugs for those timestamps, limited to 3
    boards = conn.execute('''
        SELECT board_slug FROM questions
        GROUP BY board_slug
        ORDER BY MAX(created_at) DESC
        LIMIT 3
    ''').fetchall()
    conn.close()
    return [{'slug': b['board_slug']} for b in boards]


# Initialize DB on import (safe if already exists)
init_db()
