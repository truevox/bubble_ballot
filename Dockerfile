FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN useradd --create-home --uid 10001 bubble \
    && mkdir /data \
    && chown bubble:bubble /data

COPY --chown=bubble:bubble . /app

ENV BUBBLE_DB=/data/board.db \
    PORT=5000

USER bubble
VOLUME /data
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/healthz' % os.environ.get('PORT','5000'), timeout=3)"

CMD ["sh", "-c", "exec gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --access-logfile -"]
