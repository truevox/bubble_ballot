# Bubble Ballot

Bubble Ballot is a live Q&A board for classrooms, meetings and talks. Anyone with the board link can post a question and upvote the ones they want answered, anonymously. The most-upvoted questions rise to the top as votes come in. There are no accounts or logins.

## How it works

- Type a board name on the home page, or visit `/any-name` directly, to open a board. Names are normalised to lowercase letters, digits and hyphens.
- The first person to open a brand-new board becomes its host. The host key is stored in that browser. The Share dialog has a private "host link" (the board URL with `#host=...` added) that lets the host moderate from another device. Anyone with that link can moderate the board, so keep it private.
- Share shows the board link and a QR code.
- Each browser can upvote a question once, and can take the vote back.
- While someone types a question, similar existing questions are shown so they can upvote one instead of posting a duplicate.
- Hosts can mark questions answered (and reopen them) and remove any question. People can remove questions they asked themselves.
- The list updates by polling the server every 4 seconds while the page is visible.

## Run it

### With Docker Compose

```bash
docker compose up -d
```

Open http://localhost:5000. Data is kept in the named volume `bubble-data`, so it survives restarts and rebuilds. `docker compose down` stops the app and keeps the data; `docker compose down -v` deletes it.

The compose file sets no configuration. To use any variable from the table below, add an `environment:` block to the `web` service in `docker-compose.yml`.

### Without Docker

Use Python 3 (the Docker image uses 3.12).

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

For development, run the built-in server:

```bash
python app.py
```

It listens on `0.0.0.0` at `$PORT` (default 5000). For production, run it the way the Docker image does:

```bash
gunicorn app:app --bind 0.0.0.0:5000 --workers 2 --threads 4
```

The SQLite database is created on first start in the current directory as `board.db`, unless `BUBBLE_DB` is set.

## Configuration

These are the environment variables the code reads.

| Variable | Default | Meaning |
|---|---|---|
| `BUBBLE_DB` | `board.db` in the working directory | Path to the SQLite database file. The Docker image sets `/data/board.db`. |
| `PORT` | `5000` | Port the app listens on, used by `python app.py` and by the Docker image's gunicorn command. |
| `TRUST_PROXY` | unset | Set to `1` when the app runs behind a reverse proxy. Flask then trusts the `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` headers, so links and QR codes use the public address and rate limits see real client addresses. Any other value is ignored. |
| `FLASK_DEBUG` | `False` | Set to `true` to enable the Flask debugger. Only read by `python app.py`. Never enable it on a server others can reach. |

For a public deployment, run the app behind an HTTPS reverse proxy (such as Caddy, nginx or Traefik) and set `TRUST_PROXY=1`. Only set it when clients cannot reach the app directly, because otherwise a client can send its own `X-Forwarded-For` header and get around the rate limit. With the compose file as shipped, port 5000 is open to every interface; change the port mapping to `"127.0.0.1:5000:5000"` so only the proxy on the same machine can reach it.

## Good to know

- Identity is a random ID kept in each browser's localStorage. Vote limits and host status are per browser and are not tamper-proof: someone can clear their storage or switch browsers and vote again. This is fine for classrooms and meetings, but do not use it for polls that must be binding.
- Boards are unlisted, but anyone who knows or guesses a board name can open it and post. Pick an unusual name, or leave the name blank on the home page to get a generated one.
- Clearing browser data loses host status unless the host link was saved. Save the host link (a bookmark or password manager) before relying on a board.
- Posting is rate-limited per client IP: 120 new questions per 60 seconds, which leaves room for a whole class behind one school network address. Votes are not limited. The counter lives in memory in each gunicorn worker, so with the default two workers the effective limit can be up to double that.
- Questions are at most 280 characters after whitespace is collapsed. A board returns at most 500 questions, highest-voted first.
- The only editing and moderation tools are the host's answer and remove actions and each person's own remove action. There is no way to edit a question or delete a whole board.
- Back up the database file named by `BUBBLE_DB`. Stop the app or use SQLite's `.backup` command for a consistent copy. In Docker it is `/data/board.db` inside the `bubble-data` volume.

## Development

```bash
pip install -r requirements-dev.txt
python -m pytest
```

`requirements-dev.txt` includes `requirements.txt` and adds pytest. Tests live in `tests/`.

- `app.py`: Flask app. Page routes (`/`, `/<board>`), the rate limiter and the environment settings.
- `database.py`: SQLite access. Creates the `questions`, `votes` and `boards` tables on import, and holds the slug rules.
- `templates/`: Jinja pages (`landing.html`, `board.html`, `404.html`, `_head.html`).
- `static/`: `app.js` (board page), `landing.js`, `common.js`, `style.css`, `favicon.svg`.
- `VERSION`: version string read by `app.py`.

The frontend has no build step: edit the files in `static/` and `templates/` and reload. After changing Python code, rebuild the container with `docker compose up -d --build`.

The JSON API is defined in `app.py` under `/api/<board>/...`; there is no separate API document.
