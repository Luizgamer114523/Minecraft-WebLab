from __future__ import annotations

from collections.abc import Iterable, Iterator


def iter_jpegs_from_chunks(chunks: Iterable[bytes]) -> Iterator[bytes]:
    buffer = bytearray()
    for chunk in chunks:
        if not chunk:
            continue
        buffer.extend(chunk)
        while True:
            start = buffer.find(b"\xff\xd8")
            if start < 0:
                if buffer[-1:] == b"\xff":
                    buffer[:] = b"\xff"
                    break
                buffer.clear()
                break
            if start:
                del buffer[:start]
            end = buffer.find(b"\xff\xd9", 2)
            if end < 0:
                break
            end += 2
            yield bytes(buffer[:end])
            del buffer[:end]
