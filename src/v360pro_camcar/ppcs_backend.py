from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from .ppcs_bridge import INIT_KEY, PPCSBridgeClient


class PPCSBackend(Protocol):
    def api_info(self) -> dict[str, Any]: ...

    def initialize(self, init_key: str = INIT_KEY) -> bool: ...

    def connect(
        self,
        did: str,
        *,
        connect_mode: int | None = None,
        device_type: str | int | None = "43",
        server_key: str | None = None,
    ) -> int: ...

    def check(self, session: int) -> dict[str, Any]: ...

    def write(self, session: int, channel: int, data: bytes) -> int: ...

    def read(self, session: int, channel: int, size: int, *, timeout_ms: int = 10000) -> bytes: ...

    def close(self, session: int) -> bool: ...


@dataclass
class AndroidBridgePPCSBackend:
    client: PPCSBridgeClient

    def api_info(self) -> dict[str, Any]:
        return self.client.api_info()

    def initialize(self, init_key: str = INIT_KEY) -> bool:
        return self.client.initialize(init_key)

    def connect(
        self,
        did: str,
        *,
        connect_mode: int | None = None,
        device_type: str | int | None = "43",
        server_key: str | None = None,
    ) -> int:
        return self.client.connect(did, connect_mode=connect_mode, device_type=device_type, server_key=server_key)

    def check(self, session: int) -> dict[str, Any]:
        return self.client.check(session)

    def write(self, session: int, channel: int, data: bytes) -> int:
        return self.client.write(session, channel, data)

    def read(self, session: int, channel: int, size: int, *, timeout_ms: int = 10000) -> bytes:
        return self.client.read(session, channel, size, timeout_ms=timeout_ms)

    def close(self, session: int) -> bool:
        return self.client.close(session)


class NativePPCSUnavailable(RuntimeError):
    pass


@dataclass
class NativePPCSBackend:
    library_path: str | None = None
    notes: list[str] = field(default_factory=list)

    def api_info(self) -> dict[str, Any]:
        raise NativePPCSUnavailable(_NATIVE_UNAVAILABLE)

    def initialize(self, init_key: str = INIT_KEY) -> bool:
        raise NativePPCSUnavailable(_NATIVE_UNAVAILABLE)

    def connect(
        self,
        did: str,
        *,
        connect_mode: int | None = None,
        device_type: str | int | None = "43",
        server_key: str | None = None,
    ) -> int:
        raise NativePPCSUnavailable(_NATIVE_UNAVAILABLE)

    def check(self, session: int) -> dict[str, Any]:
        raise NativePPCSUnavailable(_NATIVE_UNAVAILABLE)

    def write(self, session: int, channel: int, data: bytes) -> int:
        raise NativePPCSUnavailable(_NATIVE_UNAVAILABLE)

    def read(self, session: int, channel: int, size: int, *, timeout_ms: int = 10000) -> bytes:
        raise NativePPCSUnavailable(_NATIVE_UNAVAILABLE)

    def close(self, session: int) -> bool:
        raise NativePPCSUnavailable(_NATIVE_UNAVAILABLE)


_NATIVE_UNAVAILABLE = (
    "native PPCS backend is not implemented yet; use the Android bridge backend until the PPCS transport is ported"
)


def create_ppcs_backend(
    kind: str | None = None,
    *,
    host: str = "127.0.0.1",
    port: int = 8766,
    timeout: float = 5.0,
    library_path: str | None = None,
) -> PPCSBackend:
    backend_kind = (kind or "bridge").strip().lower()
    if backend_kind in {"bridge", "android", "android-bridge"}:
        return AndroidBridgePPCSBackend(PPCSBridgeClient(host, int(port), timeout=float(timeout)))
    if backend_kind in {"native", "local"}:
        return NativePPCSBackend(library_path=library_path)
    raise ValueError(f"unknown PPCS backend {kind!r}")
