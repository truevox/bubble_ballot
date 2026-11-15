import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module  # noqa: E402
import database  # noqa: E402


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / 'test.db')
    monkeypatch.setattr(database, 'DB_NAME', path)
    return path


@pytest.fixture
def client(db_path):
    database.init_db()
    app_module.app.config['TESTING'] = True
    app_module.app.config['RATE_LIMIT_ENABLED'] = False
    app_module.reset_rate_limits()
    yield app_module.app.test_client()
    app_module.app.config['RATE_LIMIT_ENABLED'] = True
    app_module.reset_rate_limits()


ALICE = 'alice-client-001'
BOB = 'bob-client-00002'


def hdr(cid=None, host=None):
    h = {}
    if cid:
        h['X-Client-Id'] = cid
    if host:
        h['X-Host-Key'] = host
    return h
