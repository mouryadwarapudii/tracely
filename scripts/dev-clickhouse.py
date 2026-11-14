#!/usr/bin/env python3
"""Local ClickHouse stand-in for development without Docker.

Serves the subset of the ClickHouse HTTP interface that the Tracely dashboard
uses, backed by chDB (embedded ClickHouse, `pip install chdb`). Data persists
in --path. This is a development convenience only: use a real ClickHouse
server (see docker-compose.yml) for anything else.

    python3 scripts/dev-clickhouse.py --port 8123 --path .tracely-dev/clickhouse
"""
import argparse
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from chdb import session

LOCK = threading.Lock()
SESSION = None
# URL parameters that are part of the HTTP protocol rather than query settings.
NOT_SETTINGS = {"query", "database", "default_format", "query_id", "session_id", "session_timeout", "wait_end_of_query", "user", "password"}
PARAM = re.compile(r"\{(\w+)\s*:\s*([^}]+)\}")


def bind(query: str, params: dict) -> str:
    def repl(m):
        name, typ = m.group(1), m.group(2).strip()
        if name not in params:
            return m.group(0)
        value = params[name]
        if typ.startswith(("String", "LowCardinality(String")):
            return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"
        if typ.startswith("Array"):
            return value
        if not re.fullmatch(r"-?[0-9.eE+-]+", value):
            raise ValueError(f"bad numeric parameter {name}")
        return value

    return PARAM.sub(repl, query)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _send(self, code, body: bytes, ctype="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/ping":
            return self._send(200, b"Ok.\n")
        self._run(parse_qs(url.query), b"")

    def do_POST(self):
        url = urlparse(self.path)
        self._run(parse_qs(url.query), self._body())

    def _body(self) -> bytes:
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            chunks = []
            while True:
                size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    self.rfile.readline()
                    break
                chunks.append(self.rfile.read(size))
                self.rfile.readline()
            return b"".join(chunks)
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def _run(self, qs, body: bytes):
        params = {k[6:]: v[0] for k, v in qs.items() if k.startswith("param_")}
        query = qs.get("query", [""])[0]
        text = body.decode("utf-8", "replace")
        sql = (query + "\n" + text) if query else text
        database = qs.get("database", ["default"])[0]
        try:
            if not sql.strip():
                raise ValueError("Empty query")
            sql = bind(sql, params)
            with LOCK:
                if database != "default":
                    try:
                        SESSION.query(f"USE `{database}`")
                    except Exception:
                        pass
                for name, value in qs.items():
                    if name in NOT_SETTINGS or name.startswith("param_") or not re.fullmatch(r"\w+", name):
                        continue
                    if re.fullmatch(r"[\w.-]+", value[0]):
                        try:
                            SESSION.query(f"SET {name} = '{value[0]}'")
                        except Exception:
                            pass
                out = SESSION.query(sql, qs.get("default_format", ["TabSeparated"])[0]).bytes()
            self._send(200, out, "application/json; charset=utf-8")
        except Exception as exc:  # noqa: BLE001 - surface engine errors to the client
            self._send(500, str(exc).encode())


def main():
    global SESSION
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8123)
    ap.add_argument("--path", default=".tracely-dev/clickhouse")
    args = ap.parse_args()
    SESSION = session.Session(args.path)
    print(f"dev ClickHouse (chDB) on http://127.0.0.1:{args.port}  data: {args.path}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
