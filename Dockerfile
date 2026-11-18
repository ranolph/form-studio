FROM python:3.12-alpine

ARG APP_UID=1000
ARG APP_GID=1000
RUN addgroup -g "$APP_GID" formstudio \
    && adduser -D -H -u "$APP_UID" -G formstudio formstudio \
    && mkdir -p /app /data \
    && chown "$APP_UID:$APP_GID" /data

WORKDIR /app
COPY server.py ./
COPY static ./static
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FORM_STUDIO_HOST=0.0.0.0 \
    FORM_STUDIO_DATA=/data \
    PORT=8080

USER formstudio:formstudio
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:8080/api/health',timeout=3)); assert d.get('ok') and d.get('service')=='form-studio'"
CMD ["python", "-u", "server.py"]
