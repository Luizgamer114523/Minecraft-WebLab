from __future__ import annotations

import base64
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
import json
import mimetypes
import os
import shutil
import socket
import ssl
import subprocess
import threading
import time
import tempfile
import wave
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .audio import g711a_to_pcm16le, iter_wav_g711a_chunks, pcm16le_to_g711a
from .client import CommandResponse, LiveFrame, V360PPCSSession
from .discovery import COMMON_PORTS, probe_tcp_ports, rtsp_candidates
from .media import capture_live_frames
from .ppcs_backend import NativePPCSUnavailable, create_ppcs_backend
from .ppcs_bridge import PPCSBridgeClient, PPCSBridgeError
from .protocol import (
    COMMAND_ADJUST,
    COMMAND_ORIGIN,
    COMMAND_PTZ,
    COMMAND_SET_WIFI,
    COMMAND_SET_POSITION,
    build_adjust_payload,
    build_command_frame,
    build_origin_payload,
    build_ptz_payload,
    build_set_position_payload,
    build_set_wifi_payload,
    parse_direction,
    VIDEO_FRAME_FLAG,
    AUDIO_FRAME_FLAG,
)
from .streaming import iter_jpegs_from_chunks
from .transport import send_tcp


DEFAULT_WEB_HOST = "0.0.0.0"
DEFAULT_WEB_PORT = 8765
DEFAULT_BRIDGE_HOST = "127.0.0.1"
DEFAULT_BRIDGE_PORT = 8766
DEFAULT_BRIDGE_TIMEOUT = 5.0
MAX_AGENT_DRIVE_DURATION_MS = 5000
DEFAULT_DEVICE = {
    "did": os.environ.get("SAAD_DEFAULT_DID", "EXAMPLE-DEVICE-DID"),
    "name": os.environ.get("SAAD_DEFAULT_NAME", "Camera Car"),
    "host": os.environ.get("SAAD_DEFAULT_HOST", "192.168.1.50"),
    "device_type": os.environ.get("SAAD_DEFAULT_DEVICE_TYPE", "43"),
    "password": os.environ.get("SAAD_DEFAULT_PASSWORD", "CHANGE_ME_PASSWORD"),
    "user_id": int(os.environ.get("SAAD_DEFAULT_USER_ID", "0")),
    "mac": os.environ.get("SAAD_DEFAULT_MAC", "00:00:00:00:00:00"),
}

_AGENT_LOCK = threading.Lock()
_LIVE_READ_LOCKS_LOCK = threading.Lock()
_LIVE_READ_LOCKS: dict[int, threading.Lock] = {}
_AGENT_STATE: dict[str, Any] = {
    "session": None,
    "live": False,
    "speech_channel": "agent",
    "last_error": None,
    "last_agent_message": None,
    "last_agent_message_at": None,
}

_DIRECTIONS = [
    "up",
    "down",
    "left",
    "right",
    "up-left",
    "up-right",
    "down-left",
    "down-right",
    "stop",
]


def packet_response(command_id: int, payload: bytes) -> dict[str, Any]:
    frame = build_command_frame(command_id, payload)
    return {
        "command_id": f"0x{command_id:04x}",
        "payload_hex": payload.hex(),
        "frame_hex": frame.hex(),
        "frame_len": len(frame),
    }


def build_packet(kind: str, body: dict[str, Any]) -> tuple[int, bytes]:
    if kind == "ptz":
        return (
            COMMAND_PTZ,
            build_ptz_payload(
                parse_direction(str(body.get("direction", "stop"))),
                speed=int(body.get("speed", 0)),
                channel=int(body.get("channel", 0)),
            ),
        )
    if kind == "set-position":
        return COMMAND_SET_POSITION, build_set_position_payload(int(body["x"]), int(body["y"]))
    if kind == "set-wifi":
        return (
            COMMAND_SET_WIFI,
            build_set_wifi_payload(
                str(body["ssid"]),
                str(body.get("password", "")),
                mode=int(body.get("mode", 1)),
                reserved=int(body.get("reserved", 0)),
            ),
        )
    if kind == "adjust":
        return COMMAND_ADJUST, build_adjust_payload(int(body.get("mode", 0)), int(body["x"]), int(body["y"]))
    if kind == "origin":
        return COMMAND_ORIGIN, build_origin_payload(int(body.get("value", 1)))
    raise ValueError(f"unknown command kind {kind!r}")


def _agent_spec() -> dict[str, Any]:
    return {
        "service": "saad-agent-api",
        "version": 1,
        "transport": "rest",
        "actions": {
            "start": {
                "method": "POST",
                "path": "/api/agent/start",
                "description": "Connect, login, and start the live session using default device credentials unless overridden.",
            },
            "attach": {
                "method": "POST",
                "path": "/api/agent/attach",
                "description": "Attach the agent state to an existing valid PPCS bridge session without reconnecting.",
                "body": {"session": 42},
            },
            "status": {"method": "GET", "path": "/api/agent/status"},
            "drive": {
                "method": "POST",
                "path": "/api/agent/drive",
                "body": {"direction": "up|down|left|right|up-left|up-right|down-left|down-right|stop", "speed": 0, "duration_ms": 250},
            },
            "volume": {
                "method": "POST",
                "path": "/api/agent/volume",
                "body": {"volume": 100, "audio_in": "optional", "audio_out": "optional"},
            },
            "device-info": {"method": "POST", "path": "/api/agent/device-info"},
            "set-motion": {
                "method": "POST",
                "path": "/api/agent/set-motion",
                "body": {"channel": 0, "sensitivity": 75},
            },
            "set-record-mode": {
                "method": "POST",
                "path": "/api/agent/set-record-mode",
                "body": {"record_type": 17, "enabled": True},
            },
            "set-timezone": {
                "method": "POST",
                "path": "/api/agent/set-timezone",
                "body": {"gmt_offset_hours": -4, "local_time": "YYYY-MM-DD;HH:MM:SS"},
            },
            "set-voice": {"method": "POST", "path": "/api/agent/set-voice", "body": {"code": "en"}},
            "get-voice": {"method": "POST", "path": "/api/agent/get-voice"},
            "stop": {"method": "POST", "path": "/api/agent/stop"},
            "say": {
                "method": "POST",
                "path": "/api/agent/say",
                "body": {"text": "hello", "channel": "agent|camera", "dry_run": True},
            },
            "listen-capture": {
                "method": "POST",
                "path": "/api/agent/listen-capture",
                "body": {"seconds": 3, "path": "optional output WAV path"},
            },
            "listen-transcribe": {
                "method": "POST",
                "path": "/api/agent/listen-transcribe",
                "body": {"seconds": 5, "path": "optional output WAV path", "model": "turbo", "language": "en"},
            },
        },
        "speech": {
            "default_channel": "agent",
            "camera_channel": "optional",
            "stt": "optional local Whisper CLI via listen-transcribe",
            "notes": "Agent-channel speech returns text for the caller to speak through its normal interface. Camera-channel speech is best effort through the small camera speaker.",
        },
        "safety": {
            "drive_auto_stop": True,
            "max_drive_duration_ms": 5000,
        },
    }


def _agent_status() -> dict[str, Any]:
    _refresh_agent_session_health()
    with _AGENT_LOCK:
        state = dict(_AGENT_STATE)
    return {
        "device": DEFAULT_DEVICE,
        "session": state["session"],
        "live": state["live"],
        "speech_channel": state["speech_channel"],
        "last_error": state["last_error"],
        "last_agent_message": state.get("last_agent_message"),
        "last_agent_message_at": state.get("last_agent_message_at"),
    }


def _refresh_agent_session_health() -> None:
    with _AGENT_LOCK:
        session_id = _AGENT_STATE.get("session")
        live = bool(_AGENT_STATE.get("live"))
    if session_id is None or not live:
        return
    try:
        status = PPCSBridgeClient().check(int(session_id))
        ret = _optional_int(status.get("ret"))
        if ret is not None and ret < 0:
            _mark_agent_session_dead(int(session_id), f"PPCS_Check failed: {ret}")
    except (OSError, PPCSBridgeError) as exc:
        _mark_agent_session_dead(int(session_id), str(exc))


def _mark_agent_session_dead(session_id: int, error: str) -> None:
    with _AGENT_LOCK:
        if _AGENT_STATE.get("session") != session_id:
            return
        _AGENT_STATE.update({"session": None, "live": False, "last_error": error})


def _reset_agent_state() -> None:
    with _AGENT_LOCK:
        _AGENT_STATE.update(
            {
                "session": None,
                "live": False,
                "speech_channel": "agent",
                "last_error": None,
                "last_agent_message": None,
                "last_agent_message_at": None,
            }
        )


def _live_read_lock(session_id: int) -> threading.Lock:
    with _LIVE_READ_LOCKS_LOCK:
        lock = _LIVE_READ_LOCKS.get(session_id)
        if lock is None:
            lock = threading.Lock()
            _LIVE_READ_LOCKS[session_id] = lock
        return lock


def _agent_session_id(body: dict[str, Any], *, required: bool = True) -> int | None:
    value = body.get("session")
    if value is None or value == "":
        with _AGENT_LOCK:
            value = _AGENT_STATE.get("session")
    if value is None or value == "":
        if required:
            raise ValueError("session is required; call /api/agent/start first or pass session")
        return None
    return int(value)


def _agent_connect_mode_candidates(body: dict[str, Any]) -> list[int | None]:
    requested = _optional_int(body.get("connect_mode"))
    if requested is not None:
        return [requested]
    return [None, 0]


def _connect_agent_session(bridge: PPCSBridgeClient, did: str, body: dict[str, Any]) -> int:
    delay_ms = max(0, min(5000, int(body.get("connect_retry_delay_ms", 750))))
    errors: list[str] = []
    candidates = _agent_connect_mode_candidates(body)
    for index, connect_mode in enumerate(candidates):
        try:
            return bridge.connect(
                did,
                connect_mode=connect_mode,
                device_type=body.get("device_type", "43"),
                server_key=str(body["server_key"]) if body.get("server_key") is not None else None,
            )
        except PPCSBridgeError as exc:
            errors.append(str(exc))
            if delay_ms and index < len(candidates) - 1:
                time.sleep(delay_ms / 1000)
    raise PPCSBridgeError(errors[-1] if errors else "PPCS connect failed")


def _synthesize_text_to_g711a_chunks(text: str) -> list[bytes]:
    say = shutil.which("say")
    ffmpeg = shutil.which("ffmpeg")
    if say is None:
        raise ValueError("macOS 'say' command is required for camera-channel TTS")
    if ffmpeg is None:
        raise ValueError("ffmpeg is required for camera-channel TTS conversion")
    with tempfile.TemporaryDirectory(prefix="v360-tts-") as tmpdir:
        aiff_path = Path(tmpdir) / "speech.aiff"
        wav_path = Path(tmpdir) / "speech.wav"
        subprocess.run([say, "-o", str(aiff_path), text], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(aiff_path),
                "-ac",
                "1",
                "-ar",
                "8000",
                "-sample_fmt",
                "s16",
                str(wav_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return list(iter_wav_g711a_chunks(wav_path, chunk_samples=160))


def _transcribe_wav_with_whisper(path: Path, *, model: str, language: str | None) -> dict[str, Any]:
    whisper = shutil.which("whisper")
    if whisper is None:
        raise ValueError("local Whisper CLI is required for listen-transcribe")
    with tempfile.TemporaryDirectory(prefix="v360-stt-") as tmpdir:
        command = [
            whisper,
            str(path),
            "--model",
            model,
            "--output_format",
            "txt",
            "--output_dir",
            tmpdir,
            "--verbose",
            "False",
            "--fp16",
            "False",
        ]
        if language:
            command.extend(["--language", language])
        result = subprocess.run(command, check=False, text=True, capture_output=True)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()
            raise ValueError(f"Whisper transcription failed: {detail}")
        transcript_path = Path(tmpdir) / f"{path.stem}.txt"
        transcript = transcript_path.read_text(encoding="utf-8").strip() if transcript_path.exists() else ""
    return {"stt": "whisper", "transcript": transcript, "model": model, "language": language}


def lan_urls(host: str, port: int, *, scheme: str = "http") -> list[str]:
    if host not in {"0.0.0.0", "::", ""}:
        return [f"{scheme}://{host}:{port}/"]

    addresses = {"127.0.0.1"}
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            addresses.add(sock.getsockname()[0])
    except OSError:
        pass

    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            address = info[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass

    return [f"{scheme}://{address}:{port}/" for address in sorted(addresses)]


class V360RequestHandler(SimpleHTTPRequestHandler):
    server_version = "V360CamcarWeb/0.1"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self._send_json(
                {
                    "service": "saad-web",
                    "default_host": DEFAULT_WEB_HOST,
                    "default_port": DEFAULT_WEB_PORT,
                    "bridge": {
                        "host": DEFAULT_BRIDGE_HOST,
                        "port": DEFAULT_BRIDGE_PORT,
                        "timeout": DEFAULT_BRIDGE_TIMEOUT,
                    },
                    "device": DEFAULT_DEVICE,
                    "directions": _DIRECTIONS,
                    "common_ports": list(COMMON_PORTS),
                }
            )
            return
        if parsed.path == "/api/agent/spec":
            self._send_json(_agent_spec())
            return
        if parsed.path == "/api/agent/status":
            self._send_json(_agent_status())
            return
        if parsed.path == "/api/rtsp":
            query = parse_qs(parsed.query)
            host = query.get("host", [""])[0].strip()
            if not host:
                self._send_error("host is required")
                return
            user = query.get("user", ["admin"])[0]
            password = query.get("password", ["admin"])[0]
            self._send_json({"candidates": rtsp_candidates(host, user=user, password=password)})
            return
        if parsed.path == "/api/bridge/mjpeg":
            self._handle_bridge_mjpeg(parse_qs(parsed.query))
            return
        self._serve_static(parsed.path)

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        self._serve_static(parsed.path, head_only=True)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            body = self._read_json()
            if parsed.path == "/api/encode":
                self._handle_encode(body)
                return
            if parsed.path == "/api/send-tcp":
                self._handle_send_tcp(body)
                return
            if parsed.path == "/api/scan":
                self._handle_scan(body)
                return
            if parsed.path.startswith("/api/agent/"):
                self._handle_agent(parsed.path.removeprefix("/api/agent/"), body)
                return
            if parsed.path.startswith("/api/bridge/"):
                self._handle_bridge(parsed.path.removeprefix("/api/bridge/"), body)
                return
            self._send_error("not found", status=HTTPStatus.NOT_FOUND)
        except (KeyError, TypeError, ValueError) as exc:
            self._send_error(str(exc))
        except (OSError, PPCSBridgeError, NativePPCSUnavailable) as exc:
            self._send_error(str(exc), status=HTTPStatus.BAD_GATEWAY)

    def _handle_encode(self, body: dict[str, Any]) -> None:
        command_id, payload = build_packet(str(body.get("kind", "ptz")), body)
        self._send_json(packet_response(command_id, payload))

    def _handle_send_tcp(self, body: dict[str, Any]) -> None:
        host = str(body.get("host", "")).strip()
        if not host:
            raise ValueError("host is required")
        port = int(body["port"])
        timeout = float(body.get("timeout", 3.0))
        command_id, payload = build_packet(str(body.get("kind", "ptz")), body)
        packet = packet_response(command_id, payload)
        if body.get("dry_run", False):
            self._send_json({"dry_run": True, "packet": packet})
            return
        sent = send_tcp(host, port, build_command_frame(command_id, payload), timeout=timeout)
        self._send_json({"dry_run": False, "host": host, "port": port, "sent": sent, "packet": packet})

    def _handle_scan(self, body: dict[str, Any]) -> None:
        host = str(body.get("host", "")).strip()
        if not host:
            raise ValueError("host is required")
        ports = body.get("ports") or list(COMMON_PORTS)
        timeout = float(body.get("timeout", 0.4))
        results = probe_tcp_ports(host, [int(port) for port in ports], timeout=timeout)
        self._send_json({"results": [result.__dict__ for result in results]})

    def _handle_agent(self, action: str, body: dict[str, Any]) -> None:
        if action == "start":
            self._send_json(self._agent_start(body))
            return
        if action == "attach":
            self._send_json(self._agent_attach(body))
            return
        if action == "drive":
            self._send_json(self._agent_drive(body))
            return
        if action == "stop":
            self._send_json(self._agent_stop(body))
            return
        if action == "volume":
            self._send_json(self._agent_volume(body))
            return
        if action in {"device-info", "set-motion", "set-record-mode", "set-timezone", "set-voice", "get-voice"}:
            self._send_json(self._agent_device_setting(action, body))
            return
        if action == "say":
            self._send_json(self._agent_say(body))
            return
        if action == "listen-capture":
            self._send_json(self._agent_listen_capture(body))
            return
        if action == "listen-transcribe":
            self._send_json(self._agent_listen_transcribe(body))
            return
        self._send_error("not found", status=HTTPStatus.NOT_FOUND)

    def _agent_start(self, body: dict[str, Any]) -> dict[str, Any]:
        merged = {**DEFAULT_DEVICE, **body}
        bridge = self._bridge_client(merged)
        did = str(merged.get("did", "")).strip()
        if not did:
            raise ValueError("did is required")
        session_id = _connect_agent_session(bridge, did, merged)
        session = V360PPCSSession(bridge, session_id)
        timeout_ms = int(merged.get("timeout_ms", 10000))
        login_response = session.login_wait(
            str(merged["password"]),
            share=bool(merged.get("share", False)),
            user_id=int(merged.get("user_id", 0)),
            timeout_ms=timeout_ms,
        )
        live_response = session.start_live_wait(**_live_start_kwargs(merged), timeout_ms=timeout_ms)
        with _AGENT_LOCK:
            _AGENT_STATE.update({"session": session_id, "live": True, "speech_channel": "agent", "last_error": None})
        return {
            "session": session_id,
            "login": _login_response_to_dict(login_response),
            "live": _live_start_response_to_dict(live_response),
        }

    def _agent_attach(self, body: dict[str, Any]) -> dict[str, Any]:
        session_id = _agent_session_id(body)
        bridge = self._bridge_client(body)
        status = bridge.check(session_id)
        ret = _optional_int(status.get("ret"))
        if ret is not None and ret < 0:
            raise PPCSBridgeError(f"PPCS_Check failed: {ret}")
        with _AGENT_LOCK:
            _AGENT_STATE.update({"session": session_id, "live": True, "last_error": None})
        return {"session": session_id, "live": True, "status": status}

    def _agent_drive(self, body: dict[str, Any]) -> dict[str, Any]:
        session_id = _agent_session_id(body)
        bridge = self._bridge_client(body)
        session = V360PPCSSession(bridge, session_id)
        direction = str(body.get("direction", "stop"))
        speed = int(body.get("speed", 0))
        channel = int(body.get("channel", 0))
        duration_ms = max(0, min(MAX_AGENT_DRIVE_DURATION_MS, int(body.get("duration_ms", 250))))
        written = session.drive(direction, speed=speed, channel=channel)
        if duration_ms:
            time.sleep(duration_ms / 1000)
        stop_written = session.drive("stop", speed=0, channel=channel)
        return {
            "session": session_id,
            "direction": direction,
            "speed": speed,
            "duration_ms": duration_ms,
            "written": written,
            "stop_written": stop_written,
            "stopped": True,
        }

    def _agent_stop(self, body: dict[str, Any]) -> dict[str, Any]:
        session_id = _agent_session_id(body, required=False)
        if session_id is None:
            with _AGENT_LOCK:
                _AGENT_STATE.update({"live": False})
            return {"session": None, "stopped": True}
        bridge = self._bridge_client(body)
        session = V360PPCSSession(bridge, session_id)
        drive_written = session.drive("stop")
        live_written = session.stop_live()
        with _AGENT_LOCK:
            _AGENT_STATE.update({"session": session_id, "live": False})
        return {"session": session_id, "drive_written": drive_written, "live_written": live_written, "stopped": True}

    def _agent_volume(self, body: dict[str, Any]) -> dict[str, Any]:
        session_id = _agent_session_id(body)
        volume = int(body.get("volume", 100))
        audio_in = int(body.get("audio_in", volume))
        audio_out = int(body.get("audio_out", volume))
        audio_in = max(0, min(100, audio_in))
        audio_out = max(0, min(100, audio_out))
        session = V360PPCSSession(self._bridge_client(body), session_id)
        written = session.set_volume(audio_in, audio_out)
        return {"session": session_id, "audio_in": audio_in, "audio_out": audio_out, "written": written}

    def _agent_device_setting(self, action: str, body: dict[str, Any]) -> dict[str, Any]:
        session_id = _agent_session_id(body)
        session = V360PPCSSession(self._bridge_client(body), session_id)
        if action == "device-info":
            written = session.get_device_info()
        elif action == "set-motion":
            written = session.set_motion_detect(int(body.get("channel", 0)), int(body["sensitivity"]))
        elif action == "set-record-mode":
            written = session.set_record_mode(int(body["record_type"]), enabled=bool(body.get("enabled", False)))
        elif action == "set-timezone":
            written = session.set_timezone(
                gmt_offset_hours=int(body["gmt_offset_hours"]),
                local_time=str(body["local_time"]),
                gmt_remainder_ms=int(body.get("gmt_remainder_ms", 0)),
                dst_on=int(body.get("dst_on", 0)),
            )
        elif action == "set-voice":
            written = session.set_device_voice(str(body["code"]))
        elif action == "get-voice":
            written = session.get_device_voice()
        else:
            raise ValueError(f"unknown agent setting action {action!r}")
        return {"session": session_id, "action": action, "written": written}

    def _agent_say(self, body: dict[str, Any]) -> dict[str, Any]:
        text = str(body.get("text", "")).strip()
        if not text:
            raise ValueError("text is required")
        channel = str(body.get("channel", "agent")).strip() or "agent"
        if channel == "agent":
            with _AGENT_LOCK:
                _AGENT_STATE.update(
                    {
                        "speech_channel": "agent",
                        "last_error": None,
                        "last_agent_message": text,
                        "last_agent_message_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    }
                )
            return {"channel": "agent", "spoken": False, "text": text, "message": text}
        if channel != "camera":
            raise ValueError("channel must be 'agent' or 'camera'")
        if body.get("dry_run", False):
            return {
                "channel": "camera",
                "dry_run": True,
                "spoken": False,
                "text": text,
                "requires": ["say", "ffmpeg", "PPCS speaker/talk"],
            }
        session_id = _agent_session_id(body)
        bridge = self._bridge_client(body)
        session = V360PPCSSession(bridge, session_id)
        chunks = _synthesize_text_to_g711a_chunks(text)
        speaker_written = session.start_speaker(sub=_optional_int(body.get("sub")))
        audio_written = 0
        pts = 0
        for chunk in chunks:
            audio_written += session.send_talk_audio(chunk, pts=pts)
            pts += int((len(chunk) / 8000) * 1000)
        speaker_stop_written = session.stop_speaker(sub=_optional_int(body.get("sub")))
        with _AGENT_LOCK:
            _AGENT_STATE.update({"speech_channel": "camera", "last_error": None})
        return {
            "channel": "camera",
            "spoken": True,
            "text": text,
            "session": session_id,
            "speaker_written": speaker_written,
            "audio_written": audio_written,
            "speaker_stop_written": speaker_stop_written,
        }

    def _agent_listen_capture(self, body: dict[str, Any]) -> dict[str, Any]:
        capture = self._capture_agent_audio_to_wav(body)
        return {**capture, "stt": "handoff"}

    def _agent_listen_transcribe(self, body: dict[str, Any]) -> dict[str, Any]:
        capture = self._capture_agent_audio_to_wav(body)
        model = str(body.get("model", "turbo")).strip() or "turbo"
        language_value = body.get("language", "en")
        language = None if language_value in {None, ""} else str(language_value)
        stt = _transcribe_wav_with_whisper(Path(capture["path"]), model=model, language=language)
        return {**capture, **stt}

    def _capture_agent_audio_to_wav(self, body: dict[str, Any]) -> dict[str, Any]:
        session_id = _agent_session_id(body)
        bridge = self._bridge_client(body)
        session = V360PPCSSession(bridge, session_id)
        frame_limit = int(body.get("frames", 0))
        seconds = max(1, min(30, int(body.get("seconds", 3))))
        timeout_ms = int(body.get("timeout_ms", 10000))
        output_path = Path(str(body.get("path") or Path(tempfile.gettempdir()) / f"v360-listen-{int(time.time())}.wav"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + seconds
        total_frames = 0
        audio_frames = 0
        with wave.open(str(output_path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(8000)
            while True:
                if frame_limit and total_frames >= frame_limit:
                    break
                if not frame_limit and time.monotonic() >= deadline:
                    break
                with _live_read_lock(session_id):
                    frame = session.read_live_frame(timeout_ms=timeout_ms)
                total_frames += 1
                if frame.header.flag == AUDIO_FRAME_FLAG:
                    wav.writeframes(g711a_to_pcm16le(frame.payload))
                    audio_frames += 1
        return {
            "session": session_id,
            "path": str(output_path),
            "frames": total_frames,
            "audio_frames": audio_frames,
            "sample_rate": 8000,
            "format": "wav/pcm16le",
        }

    def _handle_bridge(self, action: str, body: dict[str, Any]) -> None:
        bridge = self._bridge_client(body)
        if action == "info":
            self._send_json({"bridge": self._bridge_config(body), **bridge.api_info()})
            return
        if action == "init":
            self._send_json({"initialized": bridge.initialize()})
            return
        if action == "connect":
            did = str(body.get("did", "")).strip()
            if not did:
                raise ValueError("did is required")
            connect_mode = _optional_int(body.get("connect_mode"))
            server_key = body.get("server_key")
            self._send_json(
                {
                    "session": bridge.connect(
                        did,
                        connect_mode=connect_mode,
                        device_type=body.get("device_type", "43"),
                        server_key=str(server_key) if server_key is not None else None,
                    )
                }
            )
            return
        if action == "open-live":
            did = str(body.get("did", "")).strip()
            if not did:
                raise ValueError("did is required")
            session_id = bridge.connect(
                did,
                connect_mode=_optional_int(body.get("connect_mode")),
                device_type=body.get("device_type", "43"),
                server_key=str(body["server_key"]) if body.get("server_key") is not None else None,
            )
            session = V360PPCSSession(bridge, session_id)
            login_response = session.login_wait(
                str(body["password"]),
                share=bool(body.get("share", False)),
                user_id=int(body.get("user_id", 0)),
                timeout_ms=int(body.get("timeout_ms", 10000)),
            )
            live_response = session.start_live_wait(
                **_live_start_kwargs(body),
                timeout_ms=int(body.get("timeout_ms", 10000)),
            )
            self._send_json(
                {
                    "session": session_id,
                    "login": _login_response_to_dict(login_response),
                    "live": _live_start_response_to_dict(live_response),
                }
            )
            return
        if action == "check":
            self._send_json(bridge.check(int(body["session"])))
            return

        session = V360PPCSSession(bridge, int(body["session"]))
        if action == "drive":
            written = session.drive(
                str(body.get("direction", "stop")),
                speed=int(body.get("speed", 0)),
                channel=int(body.get("channel", 0)),
            )
            self._send_json({"written": written})
            return
        if action == "command":
            command_id, payload = build_packet(str(body.get("kind", "ptz")), body)
            frame = build_command_frame(command_id, payload)
            self._send_json({"written": session.write_command(frame), "packet": packet_response(command_id, payload)})
            return
        if action == "login":
            written = session.login(
                str(body["password"]),
                share=bool(body.get("share", False)),
                user_id=int(body.get("user_id", 0)),
            )
            self._send_json({"written": written})
            return
        if action == "login-wait":
            response = session.login_wait(
                str(body["password"]),
                share=bool(body.get("share", False)),
                user_id=int(body.get("user_id", 0)),
                timeout_ms=int(body.get("timeout_ms", 10000)),
            )
            self._send_json(_login_response_to_dict(response))
            return
        if action == "live-start":
            self._send_json({"written": session.start_live(**_live_start_kwargs(body))})
            return
        if action == "live-start-wait":
            response = session.start_live_wait(
                **_live_start_kwargs(body),
                timeout_ms=int(body.get("timeout_ms", 10000)),
            )
            self._send_json(_live_start_response_to_dict(response))
            return
        if action == "live-stop":
            self._send_json({"written": session.stop_live(sub=_optional_int(body.get("sub")))})
            return
        if action == "audio-start":
            self._send_json({"written": session.start_audio(channel=int(body.get("channel", 0)))})
            return
        if action == "audio-stop":
            self._send_json({"written": session.stop_audio(channel=int(body.get("channel", 0)))})
            return
        if action == "speaker-start":
            self._send_json({"written": session.start_speaker(sub=_optional_int(body.get("sub")))})
            return
        if action == "speaker-stop":
            self._send_json({"written": session.stop_speaker(sub=_optional_int(body.get("sub")))})
            return
        if action == "talk-send":
            self._send_json({"written": session.send_talk_audio(_payload_bytes(body), pts=int(body.get("pts", 0)))})
            return
        if action == "talk-pcm":
            pcm = base64.b64decode(str(body["pcm16_base64"]))
            encoded = pcm16le_to_g711a(pcm)
            self._send_json({"written": session.send_talk_audio(encoded, pts=int(body.get("pts", 0))), "samples": len(pcm) // 2})
            return
        if action == "live-frame":
            with _live_read_lock(int(body["session"])):
                frame = session.read_live_frame(timeout_ms=int(body.get("timeout_ms", 10000)))
            self._send_json(_live_frame_to_dict(frame))
            return
        if action == "live-capture":
            result = capture_live_frames(
                session,
                frame_count=int(body["frames"]),
                video_path=str(body["video_path"]),
                audio_path=str(body["audio_path"]),
                metadata_path=str(body["metadata_path"]),
                timeout_ms=int(body.get("timeout_ms", 10000)),
            )
            self._send_json(result.__dict__)
            return
        if action == "device-info":
            self._send_json({"written": session.get_device_info()})
            return
        if action == "set-volume":
            self._send_json({"written": session.set_volume(int(body["audio_in"]), int(body["audio_out"]))})
            return
        if action == "set-record-mode":
            self._send_json(
                {"written": session.set_record_mode(int(body["record_type"]), enabled=bool(body.get("enabled", False)))}
            )
            return
        if action == "set-motion":
            self._send_json(
                {"written": session.set_motion_detect(int(body["channel"]), int(body["sensitivity"]))}
            )
            return
        if action == "set-timezone":
            self._send_json(
                {
                    "written": session.set_timezone(
                        gmt_offset_hours=int(body["gmt_offset_hours"]),
                        local_time=str(body["local_time"]),
                        gmt_remainder_ms=int(body.get("gmt_remainder_ms", 0)),
                        dst_on=int(body.get("dst_on", 0)),
                    )
                }
            )
            return
        if action == "set-voice":
            self._send_json({"written": session.set_device_voice(str(body["code"]))})
            return
        if action == "get-voice":
            self._send_json({"written": session.get_device_voice()})
            return
        if action == "device-info-response":
            response = session.read_device_info_response(timeout_ms=int(body.get("timeout_ms", 10000)))
            self._send_json(_device_info_response_to_dict(response))
            return
        if action == "get-voice-response":
            response = session.read_device_voice_response(timeout_ms=int(body.get("timeout_ms", 10000)))
            self._send_json(_device_voice_response_to_dict(response))
            return
        if action == "cmd-read":
            response = session.read_command_response(timeout_ms=int(body.get("timeout_ms", 10000)))
            self._send_json(_command_response_to_dict(response))
            return
        if action == "login-response":
            response = session.read_login_response(timeout_ms=int(body.get("timeout_ms", 10000)))
            self._send_json(_login_response_to_dict(response))
            return
        if action == "live-start-response":
            response = session.read_live_start_response(timeout_ms=int(body.get("timeout_ms", 10000)))
            self._send_json(_live_start_response_to_dict(response))
            return
        if action == "result-response":
            response = session.read_result_response(timeout_ms=int(body.get("timeout_ms", 10000)))
            self._send_json({"result": response.result})
            return
        self._send_error("not found", status=HTTPStatus.NOT_FOUND)

    def _handle_bridge_mjpeg(self, query: dict[str, list[str]]) -> None:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg is None:
            self._send_error("ffmpeg is required for MJPEG camera playback", status=HTTPStatus.SERVICE_UNAVAILABLE)
            return
        body = {key: values[-1] for key, values in query.items() if values}
        if not str(body.get("session", "")).strip():
            self._send_error("session is required")
            return
        session = V360PPCSSession(self._bridge_client(body), int(body["session"]))
        timeout_ms = int(body.get("timeout_ms", 10000))
        fps = max(1, min(15, int(body.get("fps", 6))))
        width = max(160, min(1920, int(body.get("width", 960))))
        proc = subprocess.Popen(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-fflags",
                "nobuffer",
                "-flags",
                "low_delay",
                "-f",
                str(body.get("codec", "hevc")).lower() if str(body.get("codec", "hevc")).lower() in {"h264", "hevc"} else "hevc",
                "-i",
                "pipe:0",
                "-vf",
                f"fps={fps},scale={width}:-1",
                "-q:v",
                "5",
                "-f",
                "image2pipe",
                "-vcodec",
                "mjpeg",
                "pipe:1",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        stop = threading.Event()

        def feed_video() -> None:
            assert proc.stdin is not None
            try:
                while not stop.is_set():
                    with _live_read_lock(int(body["session"])):
                        frame = session.read_live_frame(timeout_ms=timeout_ms)
                    if frame.header.flag == VIDEO_FRAME_FLAG:
                        proc.stdin.write(frame.payload)
                        proc.stdin.flush()
            except (BrokenPipeError, OSError, PPCSBridgeError, ValueError):
                pass
            finally:
                try:
                    proc.stdin.close()
                except OSError:
                    pass

        thread = threading.Thread(target=feed_video, daemon=True)
        thread.start()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        try:
            assert proc.stdout is not None
            for jpeg in iter_jpegs_from_chunks(iter(lambda: proc.stdout.read(8192), b"")):
                self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ")
                self.wfile.write(str(len(jpeg)).encode("ascii"))
                self.wfile.write(b"\r\n\r\n")
                self.wfile.write(jpeg)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            stop.set()
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()

    def _bridge_config(self, body: dict[str, Any]) -> dict[str, Any]:
        return {
            "host": str(body.get("bridge_host", DEFAULT_BRIDGE_HOST)).strip() or DEFAULT_BRIDGE_HOST,
            "port": int(body.get("bridge_port", DEFAULT_BRIDGE_PORT)),
            "timeout": float(body.get("timeout", DEFAULT_BRIDGE_TIMEOUT)),
        }

    def _bridge_client(self, body: dict[str, Any]) -> PPCSBridgeClient:
        config = self._bridge_config(body)
        backend_kind = str(body.get("ppcs_backend", "")).strip()
        if backend_kind:
            return create_ppcs_backend(
                backend_kind,
                host=config["host"],
                port=config["port"],
                timeout=config["timeout"],
                library_path=str(body["library_path"]) if body.get("library_path") else None,
            )
        return PPCSBridgeClient(config["host"], config["port"], timeout=config["timeout"])

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as exc:
            raise ValueError("request body must be valid JSON") from exc
        if not isinstance(data, dict):
            raise ValueError("request body must be a JSON object")
        return data

    def _serve_static(self, path: str, *, head_only: bool = False) -> None:
        name = "index.html" if path in {"", "/"} else path.lstrip("/")
        if "/" in name or name not in {"index.html", "app.css", "app.js", "saad.png"}:
            self._send_error("not found", status=HTTPStatus.NOT_FOUND)
            return
        try:
            content = resources.files("v360pro_camcar.static").joinpath(name).read_bytes()
        except FileNotFoundError:
            self._send_error("not found", status=HTTPStatus.NOT_FOUND)
            return
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text/") else mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        if not head_only:
            self.wfile.write(content)

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        content = json.dumps(payload, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _send_error(self, message: str, status: HTTPStatus = HTTPStatus.BAD_REQUEST) -> None:
        self._send_json({"error": message}, status=status)


def _optional_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


def _live_start_kwargs(body: dict[str, Any]) -> dict[str, Any]:
    return {
        "resolution": int(body.get("resolution", 1)),
        "stream_type": int(body.get("stream_type", 2)),
        "channel": int(body.get("channel", 0)),
        "sub": _optional_int(body.get("sub")),
    }


def _payload_bytes(body: dict[str, Any]) -> bytes:
    if "payload_base64" in body:
        return base64.b64decode(str(body["payload_base64"]))
    if "payload_hex" in body:
        return bytes.fromhex(str(body["payload_hex"]))
    raise ValueError("payload_base64 or payload_hex is required")


def _login_response_to_dict(response: Any) -> dict[str, Any]:
    return {
        "ret": response.ret,
        "token": response.token,
        "rev_ex_hex": response.rev_ex.hex(),
        "reserved_hex": response.reserved.hex(),
    }


def _live_start_response_to_dict(response: Any) -> dict[str, Any]:
    return {
        "video_codec": response.video_codec,
        "video_width": response.video_width,
        "video_height": response.video_height,
        "audio_codec": response.audio_codec,
        "result": response.result,
        "reserved_hex": response.reserved.hex(),
        "sub": response.sub,
    }


def _device_info_response_to_dict(response: Any) -> dict[str, Any]:
    return {
        "model": response.model,
        "vendor": response.vendor,
        "version": response.version,
        "channel": response.channel,
        "total": response.total,
        "free": response.free,
        "v1": response.v1,
        "v2": response.v2,
        "v3": response.v3,
        "reserved_hex": response.reserved.hex(),
        "is_have_tf": response.is_have_tf,
        "is_4g_support_cloud": response.is_4g_support_cloud,
        "is_support_h265": response.is_support_h265,
        "is_support_download": response.is_support_download,
        "dev_flag": response.dev_flag,
        "is_have_baidu_ai": response.is_have_baidu_ai,
        "tf_is_anomaly": response.tf_is_anomaly,
    }


def _device_voice_response_to_dict(response: Any) -> dict[str, Any]:
    return {
        "state": response.state,
        "code": response.code,
        "voice_code_hex": response.voice_code.hex(),
    }


def _live_frame_to_dict(frame: LiveFrame) -> dict[str, Any]:
    return {
        "header": {
            "flag": frame.header.flag,
            "length": frame.header.length,
            "pts": frame.header.pts,
            "frame_type": frame.header.frame_type,
            "frame_count": frame.header.frame_count,
            "online_count": frame.header.online_count,
            "codec_id": frame.header.codec_id,
            "reserved_hex": frame.header.reserved.hex(),
            "sub": frame.header.sub,
        },
        "payload_hex": frame.payload.hex(),
        "payload_base64": base64.b64encode(frame.payload).decode("ascii"),
    }


def _command_response_to_dict(response: CommandResponse) -> dict[str, Any]:
    return {
        "command_id": f"0x{response.command_id:04x}",
        "sub": response.sub,
        "payload_hex": response.payload.hex(),
        "payload_base64": base64.b64encode(response.payload).decode("ascii"),
    }


def create_server(
    host: str = DEFAULT_WEB_HOST,
    port: int = DEFAULT_WEB_PORT,
    *,
    tls_cert: str | Path | None = None,
    tls_key: str | Path | None = None,
) -> ThreadingHTTPServer:
    _reset_agent_state()
    server = ThreadingHTTPServer((host, port), V360RequestHandler)
    if tls_cert or tls_key:
        if not tls_cert or not tls_key:
            raise ValueError("both tls_cert and tls_key are required for HTTPS")
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(tls_cert), str(tls_key))
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def serve(
    host: str = DEFAULT_WEB_HOST,
    port: int = DEFAULT_WEB_PORT,
    *,
    tls_cert: str | Path | None = None,
    tls_key: str | Path | None = None,
) -> None:
    server = create_server(host, port, tls_cert=tls_cert, tls_key=tls_key)
    actual_host, actual_port = server.server_address[:2]
    scheme = "https" if tls_cert or tls_key else "http"
    print(f"Serving S.A.A.D. web UI on {scheme}://{actual_host}:{actual_port}")
    for url in lan_urls(host, actual_port, scheme=scheme):
        print(f"  {url}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\nStopping S.A.A.D. web UI")
    finally:
        server.server_close()
