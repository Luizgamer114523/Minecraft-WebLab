#!/usr/bin/env python3
"""Local-only Sentinela server with the V360 Pro PPCS API and dashboard."""
from __future__ import annotations

import ipaddress
import mimetypes
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT / "src"))

from v360pro_camcar.discovery import COMMON_PORTS, probe_tcp_ports
from v360pro_camcar.ppcs_bridge import PPCSBridgeClient, PPCSBridgeError
from v360pro_camcar.web import V360RequestHandler


class SentinelaRequestHandler(V360RequestHandler):
    server_version = "SentinelaAI/0.3"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/bridge/status":
            try:
                info = PPCSBridgeClient().api_info()
                self._send_json({"online": True, **info})
            except (OSError, PPCSBridgeError) as exc:
                self._send_json({"online": False, "error": str(exc)})
            return
        if parsed.path == "/api/probe":
            host = parse_qs(parsed.query).get("host", [""])[0].strip()
            try:
                ipaddress.IPv4Address(host)
            except ipaddress.AddressValueError:
                self._send_error("Informe um endereço IPv4 válido.")
                return
            results = probe_tcp_ports(host, COMMON_PORTS, timeout=0.35)
            opened = [result.port for result in results if result.open]
            self._send_json({
                "host": host,
                "openPorts": opened,
                "rtspCandidates": [port for port in opened if port in (554, 8554)],
                "summary": "Portas TCP abertas: " + (", ".join(map(str, opened)) or "nenhuma das portas testadas") +
                           (". RTSP possível, mas ainda não confirmado." if any(p in opened for p in (554, 8554))
                            else ". RTSP não confirmado; a câmera pode usar PPCS/P2P."),
            })
            return
        super().do_GET()

    def _serve_static(self, path: str, *, head_only: bool = False) -> None:
        if not DIST.is_dir():
            self._send_error("Build web ausente. Execute npm run build.", status=__import__("http").HTTPStatus.SERVICE_UNAVAILABLE)
            return
        requested = "index.html" if path in {"", "/"} else path.lstrip("/")
        target = (DIST / requested).resolve()
        try:
            target.relative_to(DIST.resolve())
        except ValueError:
            self._send_error("not found", status=__import__("http").HTTPStatus.NOT_FOUND)
            return
        if not target.is_file():
            target = DIST / "index.html"
        if not target.is_file():
            self._send_error("arquivo não encontrado", status=__import__("http").HTTPStatus.NOT_FOUND)
            return
        content = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime + ("; charset=utf-8" if mime.startswith("text/") or mime in {"application/javascript", "application/json"} else ""))
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


def main() -> None:
    host, port = "127.0.0.1", 8787
    server = ThreadingHTTPServer((host, port), SentinelaRequestHandler)
    print(f"Sentinela AI local em http://{host}:{port}")
    print("PPCS Android Bridge esperado em 127.0.0.1:8766")
    print("Vídeo e credenciais ficam no dispositivo. Ctrl+C encerra.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando Sentinela AI.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
