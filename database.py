import os
import re
import secrets
import sqlite3
import unicodedata
from contextlib import contextmanager

# Overridable at runtime (tests) by assigning database.DB_NAME.
DB_NAME = os.environ.get('BUBBLE_DB', 'board.db')

SLUG_RE = re.compile(r'^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$')
RESERVED_SLUGS = frozenset({'api', 'static', 'favicon.ico', 'robots.txt', 'healthz'})
MAX_QUESTIONS = 500


def is_valid_slug(slug):
    return bool(slug) and bool(SLUG_RE.match(slug)) and slug not in RESERVED_SLUGS


def slugify(text):
    text = unicodedata.normalize('NFKD', text or '')
    text = ''.join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text[:40].strip('-')


def get_db_connection():
    conn = sqlite3.connect(DB_NAME, timeout=5, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA busy_timeout = 5000')
    try:
        conn.execute('PRAGMA journal_mode = WAL')
    except sqlite3.OperationalError:
        pass
    return conn


@contextmanager
def _tx(immediate=True):
    conn = get_db_connection()
    try:
        conn.execute('BEGIN IMMEDIATE' if immediate else 'BEGIN')
        try:
            yield conn
        except BaseException:
            conn.execute('ROLLBACK')
            raise
        else:
            conn.execute('COMMIT')
    finally:
        conn.close()


def init_db():
    conn = get_db_connection()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                board_slug TEXT NOT NULL,
                content TEXT NOT NULL,
                votes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cols = {r['name'] for r in conn.execute('PRAGMA table_info(questions)')}
        for name, ddl in (('author_id', 'TEXT'),
                          ('answered', 'INTEGER NOT NULL DEFAULT 0')):
            if name not in cols:
                try:
                    conn.execute(f'ALTER TABLE questions ADD COLUMN {name} {ddl}')
                except sqlite3.OperationalError as e:
                    if 'duplicate column' not in str(e).lower():
                        raise
        conn.execute('CREATE INDEX IF NOT EXISTS idx_questions_board ON questions(board_slug)')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS votes (
                question_id INTEGER NOT NULL,
                client_id TEXT NOT NULL,
                PRIMARY KEY (question_id, client_id)
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS boards (
                slug TEXT PRIMARY KEY,
                host_key TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    finally:
        conn.close()


def _row_to_question(row, client_id):
    created = (row['created_at'] or '').replace(' ', 'T')
    if created and not created.endswith('Z'):
        created += 'Z'
    return {
        'id': row['id'],
        'content': row['content'],
        'votes': row['votes'] or 0,
        'voted': bool(row['voted']),
        'mine': bool(client_id) and row['author_id'] == client_id,
        'answered': bool(row['answered']),
        'created_at': created,
    }


_SELECT = '''
    SELECT q.*, EXISTS(SELECT 1 FROM votes v
                       WHERE v.question_id = q.id AND v.client_id = :cid) AS voted
    FROM questions q
'''


def get_board(slug):
    conn = get_db_connection()
    try:
        row = conn.execute('SELECT * FROM boards WHERE slug = ?', (slug,)).fetchone()
        has_q = conn.execute('SELECT 1 FROM questions WHERE board_slug = ? LIMIT 1',
                             (slug,)).fetchone() is not None
    finally:
        conn.close()
    return {
        'exists': row is not None or has_q,
        'host_key': row['host_key'] if row else None,
    }


def get_questions(slug, client_id=None, query=None):
    sql = _SELECT + ' WHERE q.board_slug = :slug'
    params = {'cid': client_id or '', 'slug': slug, 'lim': MAX_QUESTIONS}
    if query:
        esc = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        sql += " AND q.content LIKE :pat ESCAPE '\\'"
        params['pat'] = f'%{esc}%'
    sql += ' ORDER BY q.votes DESC, q.created_at DESC, q.id DESC LIMIT :lim'
    conn = get_db_connection()
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return [_row_to_question(r, client_id) for r in rows]


def get_question(slug, question_id, client_id=None):
    conn = get_db_connection()
    try:
        row = conn.execute(_SELECT + ' WHERE q.id = :id AND q.board_slug = :slug',
                           {'cid': client_id or '', 'id': question_id, 'slug': slug}).fetchone()
    finally:
        conn.close()
    return _row_to_question(row, client_id) if row else None


def get_question_author(slug, question_id):
    """Returns (found, author_id)."""
    conn = get_db_connection()
    try:
        row = conn.execute('SELECT author_id FROM questions WHERE id = ? AND board_slug = ?',
                           (question_id, slug)).fetchone()
    finally:
        conn.close()
    return (True, row['author_id']) if row else (False, None)


def add_question(slug, content, author_id):
    with _tx() as conn:
        conn.execute('INSERT OR IGNORE INTO boards (slug, host_key) VALUES (?, NULL)', (slug,))
        cur = conn.execute('INSERT INTO questions (board_slug, content, author_id) VALUES (?, ?, ?)',
                           (slug, content, author_id))
        return cur.lastrowid


def vote(slug, question_id, client_id, amount=1):
    """Idempotent upvote. Returns votes count, or None if not in this board."""
    with _tx() as conn:
        if not conn.execute('SELECT 1 FROM questions WHERE id = ? AND board_slug = ?',
                            (question_id, slug)).fetchone():
            return None
        cur = conn.execute('INSERT OR IGNORE INTO votes (question_id, client_id) VALUES (?, ?)',
                           (question_id, client_id))
        if cur.rowcount:
            conn.execute('UPDATE questions SET votes = votes + ? WHERE id = ?', (amount, question_id))
        return conn.execute('SELECT votes FROM questions WHERE id = ?', (question_id,)).fetchone()['votes']


def unvote(slug, question_id, client_id, amount=1):
    """Idempotent un-vote. Returns votes count, or None if not in this board."""
    with _tx() as conn:
        if not conn.execute('SELECT 1 FROM questions WHERE id = ? AND board_slug = ?',
                            (question_id, slug)).fetchone():
            return None
        cur = conn.execute('DELETE FROM votes WHERE question_id = ? AND client_id = ?',
                           (question_id, client_id))
        if cur.rowcount:
            conn.execute('UPDATE questions SET votes = MAX(votes - ?, 0) WHERE id = ?',
                         (amount, question_id))
        return conn.execute('SELECT votes FROM questions WHERE id = ?', (question_id,)).fetchone()['votes']


def get_recent_boards(limit=3):
    """Slugs of the most recently active boards, newest question first."""
    conn = get_db_connection()
    try:
        rows = conn.execute('''
            SELECT board_slug FROM questions
            GROUP BY board_slug
            ORDER BY MAX(created_at) DESC, MAX(id) DESC
        ''').fetchall()
    finally:
        conn.close()
    return [r['board_slug'] for r in rows if is_valid_slug(r['board_slug'])][:limit]


def delete_question(slug, question_id):
    with _tx() as conn:
        cur = conn.execute('DELETE FROM questions WHERE id = ? AND board_slug = ?',
                           (question_id, slug))
        if cur.rowcount:
            conn.execute('DELETE FROM votes WHERE question_id = ?', (question_id,))
        return bool(cur.rowcount)


def set_answered(slug, question_id, answered):
    with _tx() as conn:
        cur = conn.execute('UPDATE questions SET answered = ? WHERE id = ? AND board_slug = ?',
                           (1 if answered else 0, question_id, slug))
        return bool(cur.rowcount)


def claim_board(slug):
    """Returns a new host key, or None if the board already exists / has questions."""
    with _tx() as conn:
        if conn.execute('SELECT 1 FROM questions WHERE board_slug = ? LIMIT 1', (slug,)).fetchone():
            return None
        key = secrets.token_urlsafe(24)
        cur = conn.execute('INSERT OR IGNORE INTO boards (slug, host_key) VALUES (?, ?)', (slug, key))
        return key if cur.rowcount else None


# Initialize DB on import (safe if already exists)
init_db()
