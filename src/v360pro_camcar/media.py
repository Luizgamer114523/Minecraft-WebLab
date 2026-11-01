from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Protocol

from .client import LiveFrame
from .protocol import AUDIO_FRAME_FLAG, VIDEO_FRAME_FLAG


class LiveFrameReader(Protocol):
    def read_live_frame(self, *, timeout_ms: int = 10000) -> LiveFrame: ...


@dataclass(frozen=True)
class LiveCaptureResult:
    frames: int
    video_frames: int
    audio_frames: int
    other_frames: int


def capture_live_frames(
    session: LiveFrameReader,
    *,
    frame_count: int,
    video_path: str | Path,
    audio_path: str | Path,
    metadata_path: str | Path,
    timeout_ms: int = 10000,
) -> LiveCaptureResult:
    video_frames = 0
    audio_frames = 0
    other_frames = 0

    with Path(video_path).open("wb") as video_file, Path(audio_path).open("wb") as audio_file, Path(metadata_path).open(
        "w", encoding="utf-8"
    ) as metadata_file:
        for index in range(int(frame_count)):
            frame = session.read_live_frame(timeout_ms=timeout_ms)
            kind = _frame_kind(frame)
            if kind == "video":
                video_file.write(frame.payload)
                video_frames += 1
            elif kind == "audio":
                audio_file.write(frame.payload)
                audio_frames += 1
            else:
                other_frames += 1
            metadata_file.write(json.dumps(_metadata(index, kind, frame), separators=(",", ":")) + "\n")

    return LiveCaptureResult(
        frames=int(frame_count),
        video_frames=video_frames,
        audio_frames=audio_frames,
        other_frames=other_frames,
    )


def _frame_kind(frame: LiveFrame) -> str:
    if frame.header.flag == VIDEO_FRAME_FLAG:
        return "video"
    if frame.header.flag == AUDIO_FRAME_FLAG:
        return "audio"
    return "other"


def _metadata(index: int, kind: str, frame: LiveFrame) -> dict[str, int | str]:
    return {
        "index": index,
        "kind": kind,
        "flag": frame.header.flag,
        "length": frame.header.length,
        "pts": frame.header.pts,
        "frame_type": frame.header.frame_type,
        "codec_id": frame.header.codec_id,
        "sub": frame.header.sub,
    }
