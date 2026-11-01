#!/usr/bin/env python3
"""Sentinela AI local bridge. Loopback-only by default; no cloud video upload."""
from __future__ import annotations
import argparse, json, mimetypes, re, socket, threading, time, urllib.parse
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
VERSION = "0.2.0"
LOCK = threading.RLock()
STATE = {"capture": None, "thread": None, "running": False, "source_label": None,
         "frame": None, "events": deque(maxlen=80), "seq": 0, "stop": False, "error": None}


def source_label(source):
    if source.isdigit():
        return "Câmera local #" + source
    try:
        parsed = urllib.parse.urlsplit(source)
        return (parsed.scheme.upper() + " · " + (parsed.hostname or "fonte de rede"))
    except Exception:
        return "Fonte de vídeo"


def add_event(title, detail):
    with LOCK:
        STATE["seq"] += 1
        STATE["events"].append({"id": STATE["seq"], "timestamp": time.time(),
                                "title": title, "detail": detail})


def capture_worker(source):
    try:
        import cv2
        cap = cv2.VideoCapture(int(source) if source.isdigit() else source)
        if not cap.isOpened():
            raise RuntimeError("A fonte não abriu. Verifique IP, caminho RTSP, usuário e senha.")
        with LOCK:
            STATE["capture"] = cap
        previous = None
        last_event = 0
        while True:
            with LOCK:
                if STATE["stop"]:
                    break
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.08)
                if not cap.isOpened():
                    break
                continue
            small = cv2.resize(frame, (320, 180))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            if previous is not None:
                diff = cv2.absdiff(gray, previous)
                _, mask = cv2.threshold(diff, 24, 255, cv2.THRESH_BINARY)
                ratio = cv2.countNonZero(mask) / float(mask.size)
                if ratio > 0.025 and time.time() - last_event > 4.5:
                    last_event = time.time()
                    add_event("Movimento detectado", "intensidade " + str(round(ratio * 100)) + "%")
            previous = gray
            ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 78])
            if ok:
                with LOCK:
                    STATE["frame"] = encoded.tobytes()
        cap.release()
    except Exception as exc:
        with LOCK:
            STATE["error"] = str(exc)
    finally:
        with LOCK:
            cap = STATE.get("capture")
            STATE["capture"] = None
            STATE["running"] = False
            STATE["thread"] = None
            STATE["frame"] = None
            STATE["stop"] = False
        if cap:
            try:
                cap.release()
            except Exception:
                pass


def stop_source():
    with LOCK:
        thread = STATE.get("thread")
        STATE["stop"] = True
    if thread and thread.is_alive():
        thread.join(timeout=3)
    with LOCK:
        if not thread or not thread.is_alive():
            STATE.update({"running": False, "thread": None, "capture": None,
                          "frame": None, "source_label": None, "stop": False})


class Handler(BaseHTTPRequestHandler):
    server_version = "SentinelaBridge/" + VERSION

    def log_message(self, fmt, *args):
        # Never log request bodies or query strings: RTSP URLs may contain credentials.
        print("[SentinelaBridge]", self.command, self.path.split("?", 1)[0])

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path)
        if path.path == "/api/status":
            with LOCK:
                return self.send_json({"ok": True, "version": VERSION, "running": STATE["running"],
                                       "sourceLabel": STATE["source_label"], "error": STATE["error"]})
        if path.path == "/api/events":
            with LOCK:
                return self.send_json({"events": list(STATE["events"])})
        if path.path == "/api/probe":
            host = urllib.parse.parse_qs(path.query).get("host", [""])[0]
            try:
                socket.inet_aton(host)
            except OSError:
                return self.send_json({"error": "Informe um endereço IPv4 válido."}, 400)
            ports = [554, 8554, 80, 443, 8000, 8080, 8081, 8899, 34567]
            opened = []
            for port in ports:
                try:
                    with socket.create_connection((host, port), timeout=0.45):
                        opened.append(port)
                except OSError:
                    pass
            rtsp = [p for p in opened if p in (554, 8554)]
            if rtsp:
                message = "Portas abertas: " + ", ".join(map(str, opened)) + ". RTSP possível na porta " + ", ".join(map(str, rtsp)) + "; falta descobrir o caminho do stream."
            else:
                message = "Portas TCP respondendo: " + (", ".join(map(str, opened)) or "nenhuma das testadas") + ". RTSP/ONVIF não confirmado; a V360 pode usar P2P proprietário."
            return self.send_json({"host": host, "openPorts": opened, "rtspCandidates": rtsp, "summary": message})
        if path.path == "/stream.mjpg":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.end_headers()
            try:
                while True:
                    with LOCK:
                        frame, active = STATE["frame"], STATE["running"]
                    if frame:
                        self.wfile.write(b"--frame\\r\\nContent-Type: image/jpeg\\r\\nContent-Length: " + str(len(frame)).encode() + b"\\r\\n\\r\\n" + frame + b"\\r\\n")
                        self.wfile.flush()
                    elif not active:
                        time.sleep(0.2)
                    else:
                        time.sleep(0.04)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        requested = path.path.lstrip("/") or "index.html"
        target = (DIST / requested).resolve()
        if DIST not in target.parents and target != DIST / "index.html":
            return self.send_json({"error": "Not found"}, 404)
        if not target.is_file():
            target = DIST / "index.html"
        if not target.is_file():
            return self.send_json({"error": "Execute npm run build antes de iniciar a ponte."}, 503)
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            payload = json.loads(body or b"{}")
        except Exception:
            return self.send_json({"error": "JSON inválido."}, 400)
        if path == "/api/source/start":
            source = str(payload.get("source", "")).strip()
            if not (source.isdigit() or re.match(r"^(rtsps?|https?)://", source, re.I)):
                return self.send_json({"error": "Use o índice de uma câmera ou uma URL RTSP/HTTP."}, 400)
            stop_source()
            with LOCK:
                STATE.update({"error": None, "stop": False, "source_label": source_label(source), "running": True})
                worker = threading.Thread(target=capture_worker, args=(source,), daemon=True)
                STATE["thread"] = worker
                worker.start()
            time.sleep(0.5)
            with LOCK:
                if STATE["error"]:
                    return self.send_json({"error": STATE["error"]}, 502)
                return self.send_json({"ok": True, "sourceLabel": STATE["source_label"]})
        if path == "/api/source/stop":
            stop_source()
            return self.send_json({"ok": True})
        return self.send_json({"error": "Not found"}, 404)


def main():
    parser = argparse.ArgumentParser(description="Sentinela AI local video bridge")
    parser.add_argument("--host", default="127.0.0.1", help="Por segurança, padrão é somente o próprio dispositivo")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    print("Sentinela Bridge " + VERSION + " em http://" + args.host + ":" + str(args.port))
    print("Loopback ativo. Ctrl+C encerra.")
    try:
        ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_source()


if __name__ == "__main__":
    main()
