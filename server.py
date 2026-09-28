#!/usr/bin/env python3
"""Loopback-only Cohort server. No third-party requests; uploads are ephemeral."""
import json
import os
import secrets
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / '.runtime'
MAX_BYTES = 20 * 1024 * 1024
TOKEN = secrets.token_urlsafe(32)
OCR_LOCK = threading.Lock()
PORT = int(os.environ.get('COHORT_PORT', '4173'))


def build_extractor():
    if sys.platform != 'darwin':
        return False
    source = ROOT / 'native' / 'Extract.swift'
    binary = RUNTIME / 'extract'
    if binary.exists() and binary.stat().st_mtime >= source.stat().st_mtime:
        return True
    RUNTIME.mkdir(exist_ok=True)
    result = subprocess.run(['/usr/bin/swiftc', '-O', '-module-cache-path', str(RUNTIME / 'module-cache'), str(source), '-o', str(binary)], capture_output=True, timeout=180)
    if result.returncode:
        print('Local extraction is unavailable. Install Apple Command Line Tools and restart.', file=sys.stderr)
        return False
    return True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def log_message(self, format, *args):
        pass  # Do not log invoice content, filenames, or upload metadata.

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def safe_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}

    def reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.safe_host():
            return self.reply(403, {'error': 'Local access only.'})
        if urlsplit(self.path).path == '/api/extraction-status':
            return self.reply(200, {'available': (RUNTIME / 'extract').exists(), 'mode': 'on-device', 'token': TOKEN})
        if urlsplit(self.path).path.startswith('/api/'):
            return self.reply(404, {'error': 'Unknown action.'})
        return super().do_GET()

    def do_POST(self):
        if not self.safe_host() or self.headers.get('Origin') not in {f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}'}:
            return self.reply(403, {'error': 'Open this app from its local address.'})
        if not secrets.compare_digest(self.headers.get('X-Cohort-Token', ''), TOKEN):
            return self.reply(403, {'error': 'Reload the import screen and try again.'})
        if urlsplit(self.path).path != '/api/extract':
            return self.reply(404, {'error': 'Unknown action.'})
        mime = self.headers.get('Content-Type', '').split(';')[0]
        ext = {'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/heic': '.heic', 'image/heif': '.heic'}.get(mime)
        if not ext:
            return self.reply(415, {'error': 'Use a PDF, PNG, JPEG, or HEIC file.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BYTES:
            return self.reply(413, {'error': 'Choose a document smaller than 20 MB.'})
        if not (RUNTIME / 'extract').exists():
            return self.reply(503, {'error': 'Local recognition requires macOS and Apple Command Line Tools. Start the app with python3 server.py.'})
        if not OCR_LOCK.acquire(blocking=False):
            return self.reply(429, {'error': 'Another document is being read. Please try again shortly.'})
        try:
            self.connection.settimeout(30)
            data = self.rfile.read(length)
            if len(data) != length:
                return self.reply(400, {'error': 'The upload was interrupted. Try again.'})
            if ext == '.pdf' and not data.startswith(b'%PDF-'):
                return self.reply(415, {'error': 'This file is not a valid PDF.'})
            with tempfile.TemporaryDirectory(prefix='cohort-import-') as folder:
                path = Path(folder) / ('invoice' + ext)
                path.write_bytes(data)
                path.chmod(0o600)
                result = subprocess.run([str(RUNTIME / 'extract'), str(path)], capture_output=True, timeout=120)
                if result.returncode:
                    return self.reply(422, {'error': result.stderr.decode(errors='replace')[-1500:].strip() or 'Could not read this document.'})
                return self.reply(200, json.loads(result.stdout))
        except subprocess.TimeoutExpired:
            return self.reply(408, {'error': 'Recognition took too long. Try fewer pages or a smaller scan.'})
        except (ValueError, OSError, TimeoutError):
            return self.reply(400, {'error': 'The document could not be processed. Try a different copy.'})
        finally:
            OCR_LOCK.release()


if __name__ == '__main__':
    print('Preparing local invoice recognition…', flush=True)
    ready = build_extractor()
    print(f'Cohort: http://127.0.0.1:{PORT} — extraction {"ready" if ready else "unavailable"}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
