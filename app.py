import hmac
import io
import os
import re
import threading
import time
from collections import defaultdict, deque

import segno
from jinja2 import TemplateNotFound
from flask import Flask, Response, jsonify, redirect, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix

import database
from database import is_valid_slug, slugify

try:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'VERSION')) as _f:
        VERSION = _f.read().strip() or 'dev'
except OSError:
    VERSION = 'dev'

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024
app.config['RATE_LIMIT_ENABLED'] = True
if os.environ.get('TRUST_PROXY') == '1':
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

CLIENT_ID_RE = re.compile(r'^[A-Za-z0-9_-]{8,64}$')
MAX_CONTENT_CHARS = 280
RATE_LIMIT_MAX = 30
RATE_LIMIT_WINDOW = 60.0
_rate_hits = defaultdict(deque)
_rate_lock = threading.Lock()


def reset_rate_limits():
    with _rate_lock:
        _rate_hits.clear()


def _rate_limited(ip):
    if not app.config.get('RATE_LIMIT_ENABLED', True):
        return False
    now = time.monotonic()
    with _rate_lock:
        hits = _rate_hits[ip]
        while hits and now - hits[0] > RATE_LIMIT_WINDOW:
            hits.popleft()
        if len(hits) >= RATE_LIMIT_MAX:
            return True
        hits.append(now)
        if len(_rate_hits) > 10000:  # opportunistic cleanup
            for k in [k for k, d in _rate_hits.items() if not d or now - d[-1] > RATE_LIMIT_WINDOW]:
                del _rate_hits[k]
        return False


def err(message, status):
    return jsonify({'error': message}), status


@app.after_request
def add_headers(resp):
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Referrer-Policy'] = 'same-origin'
    if request.path.startswith('/api/') and not request.path.endswith('/qr.svg'):
        resp.headers['Cache-Control'] = 'no-store'
    return resp


# ---------- helpers ----------

def _client_id(required=False):
    cid = request.headers.get('X-Client-Id')
    if cid is not None and CLIENT_ID_RE.match(cid):
        return cid, None
    if required:
        return None, err('Your browser is missing a valid client id. Reload the page and try again.', 400)
    return None, None


def _is_host(board):
    key = board['host_key']
    supplied = request.headers.get('X-Host-Key')
    if not key or not supplied:
        return False
    return hmac.compare_digest(key.encode(), supplied.encode())


def _bad_slug(slug):
    return None if is_valid_slug(slug) else err('Board not found', 404)


# ---------- pages ----------

@app.route('/')
def index():
    return render_template('landing.html', version=VERSION)


@app.route('/healthz')
def healthz():
    return jsonify({'status': 'ok'})


@app.route('/favicon.ico')
def favicon():
    return redirect('/static/favicon.svg', 302)


@app.route('/robots.txt')
def robots():
    return Response('User-agent: *\nDisallow: /\n', mimetype='text/plain')


@app.route('/<board_slug>')
def board(board_slug):
    if is_valid_slug(board_slug):
        return render_template('board.html', board_slug=board_slug, version=VERSION)
    if board_slug not in database.RESERVED_SLUGS:
        fixed = slugify(board_slug)
        if fixed and fixed not in database.RESERVED_SLUGS:
            return redirect('/' + fixed, 302)
    return not_found(None)


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith('/api/'):
        return err('Not found', 404)
    try:
        return render_template('404.html', version=VERSION), 404
    except TemplateNotFound:
        return Response('Not found', 404, mimetype='text/plain')


@app.errorhandler(405)
def method_not_allowed(_e):
    if request.path.startswith('/api/'):
        return err('That action is not allowed here.', 405)
    return Response('Method not allowed', 405, mimetype='text/plain')


@app.errorhandler(413)
def too_large(_e):
    return err('That request is too large.', 413)


# ---------- API ----------

@app.route('/api/<board_slug>/questions', methods=['GET'])
def get_questions(board_slug):
    bad = _bad_slug(board_slug)
    if bad:
        return bad
    cid, _ = _client_id()
    info = database.get_board(board_slug)
    query = (request.args.get('q') or '').strip()
    questions = database.get_questions(board_slug, cid, query or None)
    return jsonify({
        'board': {
            'slug': board_slug,
            'exists': info['exists'],
            'hosted': info['host_key'] is not None,
            'is_host': _is_host(info),
        },
        'questions': questions,
    })


@app.route('/api/<board_slug>/questions', methods=['POST'])
def add_question(board_slug):
    bad = _bad_slug(board_slug)
    if bad:
        return bad
    cid, e = _client_id(required=True)
    if e:
        return e
    data = request.get_json(silent=True)
    content = data.get('content') if isinstance(data, dict) else None
    if not isinstance(content, str):
        return err('Please write a question first.', 400)
    content = ' '.join(content.split())
    if not content:
        return err('Please write a question first.', 400)
    if len(content) > MAX_CONTENT_CHARS:
        return err(f'Questions can be at most {MAX_CONTENT_CHARS} characters.', 400)
    if _rate_limited(request.remote_addr or 'unknown'):
        return err("You're posting too fast. Give it a minute.", 429)
    new_id = database.add_question(board_slug, content, cid)
    return jsonify(database.get_question(board_slug, new_id, cid)), 201


@app.route('/api/<board_slug>/questions/<int:question_id>/vote', methods=['POST', 'DELETE'])
def vote_question(board_slug, question_id):
    bad = _bad_slug(board_slug)
    if bad:
        return bad
    cid, e = _client_id(required=True)
    if e:
        return e
    if request.method == 'POST':
        votes = database.vote(board_slug, question_id, cid)
    else:
        votes = database.unvote(board_slug, question_id, cid)
    if votes is None:
        return err('Question not found', 404)
    return jsonify({'id': question_id, 'votes': votes, 'voted': request.method == 'POST'})


@app.route('/api/<board_slug>/questions/<int:question_id>', methods=['DELETE'])
def delete_question(board_slug, question_id):
    bad = _bad_slug(board_slug)
    if bad:
        return bad
    cid, e = _client_id(required=True)
    if e:
        return e
    found, author = database.get_question_author(board_slug, question_id)
    if not found:
        return err('Question not found', 404)
    if not (_is_host(database.get_board(board_slug)) or (author is not None and author == cid)):
        return err('Only the host or the person who asked can remove this.', 403)
    database.delete_question(board_slug, question_id)
    return '', 204


@app.route('/api/<board_slug>/questions/<int:question_id>', methods=['PATCH'])
def patch_question(board_slug, question_id):
    bad = _bad_slug(board_slug)
    if bad:
        return bad
    cid, e = _client_id(required=True)
    if e:
        return e
    if not _is_host(database.get_board(board_slug)):
        return err('Only the host can do that.', 403)
    data = request.get_json(silent=True)
    answered = data.get('answered') if isinstance(data, dict) else None
    if not isinstance(answered, bool):
        return err('Please say whether the question is answered.', 400)
    if not database.set_answered(board_slug, question_id, answered):
        return err('Question not found', 404)
    return jsonify(database.get_question(board_slug, question_id, cid))


@app.route('/api/<board_slug>/claim', methods=['POST'])
def claim(board_slug):
    bad = _bad_slug(board_slug)
    if bad:
        return bad
    key = database.claim_board(board_slug)
    if key is None:
        return err('This board already has a host.', 409)
    return jsonify({'host_key': key}), 201


@app.route('/api/<board_slug>/qr.svg')
def qr(board_slug):
    bad = _bad_slug(board_slug)
    if bad:
        return bad
    code = segno.make(request.url_root + board_slug, error='m')
    buf = io.BytesIO()
    code.save(buf, kind='svg', dark='#04263d', light='#ffffff', border=2,
              xmldecl=False, omitsize=True)
    resp = Response(buf.getvalue(), mimetype='image/svg+xml')
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    return resp


if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
