from __future__ import annotations

import base64
from dataclasses import dataclass
import json
import socket
from typing import Any

INIT_KEY = "EEGDFHBLKGJIGEJCECHIFFEKHKNAHBNAHAFJBECFADJELOLDDPAKCHOEGCLGJPLDACMCKODGOGMNBHCCJDMH"
NEW_INIT_KEY = "EIHGFOBCKIIMGMJCEDHJFAEIGANHHENMHMFABMDDAKJJLHKDDHACDEPBGKLOIOLJAKNAKADOOJNJBMCLJGMC"
NEW_INIT_2_KEY = "EEGDFHBBKAIEGEJJEPHFFIEAHDNJHKNAGNFLBDCEACJDLJKNDNANCCPKGIKGIJLIAKNAKDDLOJNJBLCKIC"

PPCS_COMMAND_CHANNEL = 0
PPCS_TALK_CHANNEL = 1
PPCS_LIVE_CHANNEL = 2

LOW_POWER_DEVICE_TYPES = frozenset(
    {
        "09",
        "18",
        "19",
        "24",
        "32",
        "49",
        "51",
        "53",
        "55",
        "60",
        "61",
        "62",
        "63",
        "64",
        "65",
        "68",
        "69",
        "70",
        "71",
        "72",
        "73",
        "74",
        "75",
        "76",
        "81",
        "82",
        "85",
        "86",
        "87",
        "88",
        "107",
        "108",
        "109",
        "110",
        "111",
        "112",
        "113",
        "114",
        "125",
        "126",
        "127",
        "128",
        "129",
        "130",
        "131",
        "132",
        "133",
        "134",
        "135",
        "136",
        "137",
        "138",
        "139",
        "140",
        "141",
        "148",
        "149",
        "150",
        "159",
        "160",
        "161",
        "162",
        "163",
        "164",
        "165",
        "166",
        "167",
        "168",
        "169",
        "170",
        "171",
        "172",
        "181",
        "182",
    }
)


class PPCSBridgeError(RuntimeError):
    pass


def server_key_for_did(did: str) -> str:
    if did.startswith(("BFEP", "CFET", "CFMT", "CFCD", "NFET")):
        return NEW_INIT_KEY
    return NEW_INIT_2_KEY


def connect_mode_for_device_type(device_type: str | int | None) -> int:
    type_text = "" if device_type is None else str(device_type).strip()
    return 126 if type_text == "39" or type_text in LOW_POWER_DEVICE_TYPES else 1


@dataclass
class PPCSBridgeClient:
    host: str = "127.0.0.1"
    port: int = 8766
    timeout: float = 5.0

    def api_info(self) -> dict[str, Any]:
        response = self._request({"op": "api_info"})
        return {"version": response.get("version"), "info": response.get("info")}

    def initialize(self, init_key: str = INIT_KEY) -> bool:
        self._request({"op": "init", "init_key": init_key})
        return True

    def connect(
        self,
        did: str,
        *,
        connect_mode: int | None = None,
        device_type: str | int | None = "43",
        server_key: str | None = None,
    ) -> int:
        response = self._request(
            {
                "op": "connect",
                "did": did,
                "connect_mode": int(connect_mode if connect_mode is not None else connect_mode_for_device_type(device_type)),
                "server_key": server_key if server_key is not None else server_key_for_did(did),
            }
        )
        session = int(response["session"])
        check_ret = response.get("check_ret")
        if check_ret is not None and int(check_ret) < 0:
            raise PPCSBridgeError(f"PPCS connect returned unusable session {session}: check_ret {check_ret}")
        return session

    def check(self, session: int) -> dict[str, Any]:
        response = self._request({"op": "check", "session": int(session)})
        return dict(response.get("status", response))

    def write(self, session: int, channel: int, data: bytes) -> int:
        response = self._request(
            {
                "op": "write",
                "session": int(session),
                "channel": int(channel),
                "data": base64.b64encode(data).decode("ascii"),
            }
        )
        return int(response["written"])

    def read(self, session: int, channel: int, size: int, *, timeout_ms: int = 10000) -> bytes:
        response = self._request(
            {
                "op": "read",
                "session": int(session),
                "channel": int(channel),
                "size": int(size),
                "timeout_ms": int(timeout_ms),
            }
        )
        return base64.b64decode(str(response["data"]))

    def close(self, session: int) -> bool:
        self._request({"op": "close", "session": int(session)})
        return True

    def _request(self, request: dict[str, Any]) -> dict[str, Any]:
        payload = (json.dumps(request, separators=(",", ":")) + "\n").encode("utf-8")
        with socket.create_connection((self.host, int(self.port)), timeout=self.timeout) as sock:
            sock.settimeout(self.timeout)
            sock.sendall(payload)
            response = _read_json_line(sock)
        if not response.get("ok", False):
            raise PPCSBridgeError(str(response.get("error", "PPCS bridge request failed")))
        return response


def _read_json_line(sock: socket.socket) -> dict[str, Any]:
    chunks: list[bytes] = []
    while True:
        chunk = sock.recv(1)
        if not chunk:
            break
        if chunk == b"\n":
            break
        chunks.append(chunk)
    if not chunks:
        raise PPCSBridgeError("PPCS bridge closed without a response")
    try:
        response = json.loads(b"".join(chunks).decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise PPCSBridgeError("PPCS bridge returned invalid JSON") from exc
    if not isinstance(response, dict):
        raise PPCSBridgeError("PPCS bridge response must be a JSON object")
    return response
