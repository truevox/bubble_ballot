import sqlite3

import pytest

import app as app_module
import database
from conftest import ALICE, BOB, hdr


def post_q(client, slug='demo', content='Hello?', cid=ALICE):
    return client.post(f'/api/{slug}/questions', json={'content': content}, headers=hdr(cid))


def listing(client, slug='demo', cid=None, **kw):
    return client.get(f'/api/{slug}/questions', headers=hdr(cid), **kw).get_json()


# ---------- slugs / pages ----------

def test_slugify():
    assert database.slugify('  Héllo Wörld!! ') == 'hello-world'
    assert database.slugify('a___b') == 'a-b'
    assert database.slugify('!!!') == ''
    s = database.slugify('x' * 39 + ' yyyy')
    assert len(s) <= 40 and not s.endswith('-')


@pytest.mark.parametrize('slug,ok', [
    ('a', True), ('abc-def', True), ('a' * 40, True), ('a' * 41, False),
    ('-a', False), ('a-', False), ('Abc', False), ('a_b', False), ('', False),
    ('api', False), ('static', False), ('healthz', False), ('robots.txt', False),
])
def test_slug_validation(slug, ok):
    assert database.is_valid_slug(slug) is ok


def test_page_valid_redirect_and_404(client):
    assert client.get('/my-board').status_code == 200
    r = client.get('/My Board')
    assert r.status_code == 302 and r.headers['Location'].endswith('/my-board')
    assert client.get('/!!!').status_code == 404
    assert client.get('/API').status_code == 404
    assert client.get('/nope/deeper').status_code == 404


def test_misc_routes(client):
    assert client.get('/healthz').get_json() == {'status': 'ok'}
    r = client.get('/favicon.ico')
    assert r.status_code == 302 and r.headers['Location'].endswith('/static/favicon.svg')
    r = client.get('/robots.txt')
    assert r.mimetype == 'text/plain' and r.get_data(as_text=True) == 'User-agent: *\nDisallow: /\n'
    assert client.get('/healthz').headers['X-Content-Type-Options'] == 'nosniff'
    assert client.get('/healthz').headers['Referrer-Policy'] == 'same-origin'


def test_api_invalid_slug_and_unknown_path(client):
    r = client.get('/api/API/questions')
    assert r.status_code == 404 and r.get_json() == {'error': 'Board not found'}
    assert client.get('/api/Bad_Slug/questions').status_code == 404
    assert client.get('/api/boards/recent').status_code == 404
    r = client.get('/api/x/nothing/here/at/all')
    assert r.status_code == 404 and r.get_json() == {'error': 'Not found'}


def test_api_no_store(client):
    assert client.get('/api/demo/questions').headers['Cache-Control'] == 'no-store'


# ---------- create ----------

def test_create_and_whitespace_collapse(client):
    r = post_q(client, content='  hello \n\t  world  ')
    assert r.status_code == 201
    q = r.get_json()
    assert q['content'] == 'hello world'
    assert q['votes'] == 0 and q['voted'] is False and q['mine'] is True and q['answered'] is False
    assert q['created_at'].endswith('Z') and 'T' in q['created_at']


@pytest.mark.parametrize('body', [{'content': ''}, {'content': '   \n '}, {'content': 5},
                                  {'content': None}, {}, [1], 'str'])
def test_create_invalid_content(client, body):
    r = client.post('/api/demo/questions', json=body, headers=hdr(ALICE))
    assert r.status_code == 400 and 'error' in r.get_json()


def test_create_non_json(client):
    for kw in ({'data': 'not json'},
               {'data': '{bad', 'content_type': 'application/json'},
               {}):
        r = client.post('/api/demo/questions', headers=hdr(ALICE), **kw)
        assert r.status_code == 400 and 'error' in r.get_json()


def test_create_too_long(client):
    assert post_q(client, content='a' * 280).status_code == 201
    r = post_q(client, content='a' * 281)
    assert r.status_code == 400
    assert r.get_json()['error'] == 'Questions can be at most 280 characters.'
    # length is measured after whitespace collapse
    assert post_q(client, content='a ' * 140).status_code == 201


def test_create_requires_client_id(client):
    for h in ({}, {'X-Client-Id': 'short'}, {'X-Client-Id': 'bad id with spaces!!'}):
        r = client.post('/api/demo/questions', json={'content': 'x'}, headers=h)
        assert r.status_code == 400 and 'error' in r.get_json()


def test_body_too_large(client):
    r = client.post('/api/demo/questions', json={'content': 'a' * 20000}, headers=hdr(ALICE))
    assert r.status_code == 413


# ---------- listing ----------

def test_listing_order_and_flags(client):
    a = post_q(client, content='first', cid=ALICE).get_json()['id']
    b = post_q(client, content='second', cid=BOB).get_json()['id']
    c = post_q(client, content='third', cid=BOB).get_json()['id']
    client.post(f'/api/demo/questions/{a}/vote', headers=hdr(BOB))
    # same created_at second -> id DESC tiebreak; votes first
    data = listing(client, cid=BOB)
    assert [q['id'] for q in data['questions']] == [a, c, b]
    byid = {q['id']: q for q in data['questions']}
    assert byid[a]['voted'] is True and byid[a]['mine'] is False and byid[a]['votes'] == 1
    assert byid[b]['mine'] is True and byid[b]['voted'] is False
    anon = listing(client)
    assert all(not q['voted'] and not q['mine'] for q in anon['questions'])
    alice = {q['id']: q for q in listing(client, cid=ALICE)['questions']}
    assert alice[a]['mine'] is True and alice[a]['voted'] is False


def test_board_info(client):
    info = listing(client, slug='empty')['board']
    assert info == {'slug': 'empty', 'exists': False, 'hosted': False, 'is_host': False}
    post_q(client, slug='empty')
    info = listing(client, slug='empty')['board']
    assert info['exists'] is True and info['hosted'] is False
    key = client.post('/api/fresh/claim').get_json()['host_key']
    r = client.get('/api/fresh/questions', headers=hdr(ALICE, key)).get_json()
    assert r['board'] == {'slug': 'fresh', 'exists': True, 'hosted': True, 'is_host': True}
    r = client.get('/api/fresh/questions', headers=hdr(ALICE, 'wrong')).get_json()
    assert r['board']['hosted'] is True and r['board']['is_host'] is False


def test_search_filter_and_wildcards(client):
    post_q(client, content='Pizza night')
    post_q(client, content='100% sure')
    post_q(client, content='a_b')
    assert [q['content'] for q in listing(client, query_string={'q': 'PIZZA'})['questions']] == ['Pizza night']
    assert [q['content'] for q in listing(client, query_string={'q': '%'})['questions']] == ['100% sure']
    assert [q['content'] for q in listing(client, query_string={'q': '_'})['questions']] == ['a_b']


def test_boards_are_isolated(client):
    post_q(client, slug='one')
    assert listing(client, slug='two')['questions'] == []


# ---------- votes ----------

def test_vote_idempotent_and_unvote(client):
    qid = post_q(client).get_json()['id']
    url = f'/api/demo/questions/{qid}/vote'
    r = client.post(url, headers=hdr(BOB))
    assert r.status_code == 200 and r.get_json() == {'id': qid, 'votes': 1, 'voted': True}
    assert client.post(url, headers=hdr(BOB)).get_json()['votes'] == 1
    assert client.post(url, headers=hdr(ALICE)).get_json()['votes'] == 2
    r = client.delete(url, headers=hdr(BOB))
    assert r.get_json() == {'id': qid, 'votes': 1, 'voted': False}
    assert client.delete(url, headers=hdr(BOB)).get_json()['votes'] == 1


def test_vote_floor_with_legacy_count(client):
    qid = post_q(client).get_json()['id']
    conn = sqlite3.connect(database.DB_NAME)
    conn.execute('UPDATE questions SET votes = 1 WHERE id = ?', (qid,))
    conn.commit(); conn.close()
    url = f'/api/demo/questions/{qid}/vote'
    assert client.post(url, headers=hdr(BOB)).get_json()['votes'] == 2
    assert client.delete(url, headers=hdr(BOB)).get_json()['votes'] == 1
    # floor: legacy count 0 with a stray votes row must never go negative
    conn = sqlite3.connect(database.DB_NAME)
    conn.execute('UPDATE questions SET votes = 0 WHERE id = ?', (qid,))
    conn.execute('INSERT INTO votes VALUES (?, ?)', (qid, ALICE))
    conn.commit(); conn.close()
    assert client.delete(url, headers=hdr(ALICE)).get_json()['votes'] == 0


def test_vote_wrong_board_and_missing(client):
    qid = post_q(client, slug='one').get_json()['id']
    for method in (client.post, client.delete):
        r = method(f'/api/two/questions/{qid}/vote', headers=hdr(BOB))
        assert r.status_code == 404 and 'error' in r.get_json()
        assert method('/api/one/questions/9999/vote', headers=hdr(BOB)).status_code == 404


def test_vote_requires_client_id(client):
    qid = post_q(client).get_json()['id']
    assert client.post(f'/api/demo/questions/{qid}/vote').status_code == 400
    assert client.delete(f'/api/demo/questions/{qid}/vote').status_code == 400


def test_no_special_testing_board(client):
    qid = post_q(client, slug='testing').get_json()['id']
    assert client.post(f'/api/testing/questions/{qid}/vote', headers=hdr(BOB)).get_json()['votes'] == 1


# ---------- delete / answered ----------

def test_delete_by_author_host_stranger(client):
    key = client.post('/api/demo/claim').get_json()['host_key']
    q1 = post_q(client, cid=ALICE).get_json()['id']
    q2 = post_q(client, cid=ALICE).get_json()['id']
    q3 = post_q(client, cid=ALICE).get_json()['id']
    client.post(f'/api/demo/questions/{q1}/vote', headers=hdr(BOB))

    r = client.delete(f'/api/demo/questions/{q1}', headers=hdr(BOB))
    assert r.status_code == 403
    assert r.get_json()['error'] == 'Only the host or the person who asked can remove this.'
    assert client.delete(f'/api/demo/questions/{q1}', headers=hdr(BOB, 'wrong')).status_code == 403
    r = client.delete(f'/api/demo/questions/{q1}', headers=hdr(ALICE))
    assert r.status_code == 204 and r.data == b''
    conn = sqlite3.connect(database.DB_NAME)
    assert conn.execute('SELECT COUNT(*) FROM votes').fetchone()[0] == 0
    conn.close()
    assert client.delete(f'/api/demo/questions/{q2}', headers=hdr(BOB, key)).status_code == 204
    assert client.delete(f'/api/demo/questions/{q2}', headers=hdr(BOB, key)).status_code == 404
    assert client.delete(f'/api/other/questions/{q3}', headers=hdr(ALICE)).status_code == 404
    assert client.delete(f'/api/demo/questions/{q3}').status_code == 400


def test_legacy_question_without_author_not_deletable_by_stranger(client):
    qid = post_q(client).get_json()['id']
    conn = sqlite3.connect(database.DB_NAME)
    conn.execute('UPDATE questions SET author_id = NULL'); conn.commit(); conn.close()
    assert client.delete(f'/api/demo/questions/{qid}', headers=hdr(BOB)).status_code == 403


def test_answered_host_only(client):
    key = client.post('/api/demo/claim').get_json()['host_key']
    qid = post_q(client, cid=ALICE).get_json()['id']
    url = f'/api/demo/questions/{qid}'
    assert client.patch(url, json={'answered': True}, headers=hdr(ALICE)).status_code == 403
    r = client.patch(url, json={'answered': True}, headers=hdr(BOB, key))
    assert r.status_code == 200 and r.get_json()['answered'] is True
    assert listing(client)['questions'][0]['answered'] is True
    r = client.patch(url, json={'answered': False}, headers=hdr(BOB, key))
    assert r.get_json()['answered'] is False
    assert client.patch(url, json={'answered': 'yes'}, headers=hdr(BOB, key)).status_code == 400
    assert client.patch(url, data='x', headers=hdr(BOB, key)).status_code == 400
    assert client.patch('/api/demo/questions/999', json={'answered': True},
                        headers=hdr(BOB, key)).status_code == 404


# ---------- claim / qr ----------

def test_claim_once_then_409(client):
    r = client.post('/api/mine/claim')
    assert r.status_code == 201 and len(r.get_json()['host_key']) >= 20
    r = client.post('/api/mine/claim')
    assert r.status_code == 409 and 'error' in r.get_json()
    assert client.post('/api/BAD_/claim').status_code == 404


def test_claim_refused_when_board_has_questions(client):
    post_q(client, slug='busy')
    assert client.post('/api/busy/claim').status_code == 409


def test_qr_svg(client):
    r = client.get('/api/demo/qr.svg')
    assert r.status_code == 200 and r.mimetype == 'image/svg+xml'
    assert r.headers['Cache-Control'] == 'public, max-age=3600'
    body = r.get_data(as_text=True)
    assert '<svg' in body and '#04263d' in body and 'viewBox' in body
    assert 'width=' not in body.split('>')[0] and 'height=' not in body.split('>')[0]
    assert client.get('/api/Bad_/qr.svg').status_code == 404


# ---------- rate limit ----------

def test_rate_limit(client):
    app_module.app.config['RATE_LIMIT_ENABLED'] = True
    app_module.reset_rate_limits()
    for _ in range(30):
        assert post_q(client).status_code == 201
    r = post_q(client)
    assert r.status_code == 429
    assert r.get_json() == {'error': "You're posting too fast. Give it a minute."}
    app_module.reset_rate_limits()
    assert post_q(client).status_code == 201


# ---------- migration ----------

def test_migrates_old_schema(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute('''CREATE TABLE questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, board_slug TEXT NOT NULL, content TEXT NOT NULL,
        votes INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    conn.execute("INSERT INTO questions (board_slug, content, votes, created_at) "
                 "VALUES ('old', 'legacy q', 7, '2026-01-31 12:34:56')")
    conn.commit(); conn.close()

    database.init_db()
    database.init_db()  # idempotent

    app_module.app.config['RATE_LIMIT_ENABLED'] = False
    c = app_module.app.test_client()
    data = c.get('/api/old/questions', headers=hdr(ALICE)).get_json()
    assert data['board']['exists'] is True and data['board']['hosted'] is False
    q = data['questions'][0]
    assert q['content'] == 'legacy q' and q['votes'] == 7 and q['mine'] is False
    assert q['answered'] is False and q['created_at'] == '2026-01-31T12:34:56Z'
    assert c.post(f"/api/old/questions/{q['id']}/vote", headers=hdr(ALICE)).get_json()['votes'] == 8
    assert c.post('/api/old/claim').status_code == 409
    cols = {r[1] for r in sqlite3.connect(db_path).execute('PRAGMA table_info(questions)')}
    assert {'author_id', 'answered'} <= cols
