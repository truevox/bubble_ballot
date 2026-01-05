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
    conn = get_db_connection()
    questions = conn.execute('SELECT * FROM questions WHERE board_slug = ? ORDER BY votes DESC, created_at DESC',
                             (board_slug,)).fetchall()
    conn.close()
    return [dict(q) for q in questions]

def vote_question(question_id, amount=1):
    conn = get_db_connection()
    conn.execute('UPDATE questions SET votes = votes + ? WHERE id = ?', (amount, question_id))
    conn.commit()

    # Fetch updated vote count
    row = conn.execute('SELECT votes FROM questions WHERE id = ?', (question_id,)).fetchone()
    conn.close()
    return row['votes'] if row else None

def get_recent_boards():
    """
    Retrieves the 3 most recently active boards based on the latest question creation time.

    Returns:
        list: A list of board slug strings.
    """
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
    """
    Searches for questions in a specific board using a case-insensitive LIKE match.

    Args:
        board_slug (str): The slug of the board to search.
        query (str): The search query substring.
        limit (int): Maximum number of results to return (default 10).

    Returns:
        list: A list of question dictionaries matching the query.
    """
    conn = get_db_connection()
    query = f"%{query}%"
    questions = conn.execute('SELECT * FROM questions WHERE board_slug = ? AND content LIKE ? ORDER BY votes DESC, created_at DESC LIMIT ?',
                             (board_slug, query, limit)).fetchall()
    conn.close()
    return [dict(q) for q in questions]

def init_testing_board():
    """
    Pre-populate the testing board with specific questions and vote counts.
    Questions:
    - "To be?"
    - "Or not to be?"
    - "If not, why not?"
    - "Just because?"
    - "MOAR BUBBLES!!!"
    
    Vote distribution:
    - One random: 0 votes
    - One random: 201-400 votes
    - Three random: 10-120 votes each
    """
    conn = get_db_connection()
    
    questions = [
        'To be?',
        'Or not to be?',
        'If not, why not?',
        'Just because?',
        'MOAR BUBBLES!!!'
    ]
    
    QUESTION_COUNT = len(questions)
    
    # Check if testing board already has these questions
    existing = conn.execute(
        'SELECT content FROM questions WHERE board_slug = ? AND content IN (?, ?, ?, ?, ?)',
        ('testing', *questions)
    ).fetchall()
    
    if len(existing) >= QUESTION_COUNT:
        # Already populated
        conn.close()
        return
    
    # Clear existing testing board questions to start fresh
    conn.execute('DELETE FROM questions WHERE board_slug = ?', ('testing',))
    conn.commit()
    
    # Shuffle to randomize which gets which vote count
    indices = list(range(QUESTION_COUNT))
    random.shuffle(indices)
    
    vote_counts = [0] * QUESTION_COUNT
    vote_counts[indices[0]] = 0  # One random at 0
    vote_counts[indices[1]] = random.randint(201, 400)  # One random at 201-400
    vote_counts[indices[2]] = random.randint(10, 120)  # Three random at 10-120
    vote_counts[indices[3]] = random.randint(10, 120)
    vote_counts[indices[4]] = random.randint(10, 120)
    
    # Insert questions
    for i, content in enumerate(questions):
        conn.execute(
            'INSERT INTO questions (board_slug, content, votes) VALUES (?, ?, ?)',
            ('testing', content, vote_counts[i])
        )
    
    conn.commit()
    conn.close()

# Initialize DB on import (safe if already exists)
init_db()
init_testing_board()
