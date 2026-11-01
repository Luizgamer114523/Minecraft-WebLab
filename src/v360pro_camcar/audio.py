from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
import wave


def pcm16le_to_g711a(pcm: bytes) -> bytes:
    if len(pcm) % 2 != 0:
        raise ValueError("PCM16 input length must be even")
    return bytes(_linear16_to_alaw(int.from_bytes(pcm[i : i + 2], "little", signed=True)) for i in range(0, len(pcm), 2))


def g711a_to_pcm16le(data: bytes) -> bytes:
    return b"".join(_alaw_to_linear16(byte).to_bytes(2, "little", signed=True) for byte in data)


def iter_wav_g711a_chunks(path: str | Path, *, chunk_samples: int = 160) -> Iterator[bytes]:
    if chunk_samples <= 0:
        raise ValueError("chunk_samples must be positive")
    with wave.open(str(path), "rb") as wav:
        if wav.getsampwidth() != 2:
            raise ValueError("only 16-bit PCM WAV input is supported")
        channels = wav.getnchannels()
        if channels <= 0:
            raise ValueError("WAV input must have at least one channel")
        while True:
            frames = wav.readframes(chunk_samples)
            if not frames:
                break
            mono = _first_channel_pcm16le(frames, channels)
            yield pcm16le_to_g711a(mono)


def _first_channel_pcm16le(frames: bytes, channels: int) -> bytes:
    if channels == 1:
        return frames
    frame_size = channels * 2
    return b"".join(frames[i : i + 2] for i in range(0, len(frames), frame_size) if len(frames[i : i + 2]) == 2)


def _linear16_to_alaw(sample: int) -> int:
    # ITU G.711 A-law companding, with even-bit inversion applied.
    mask = 0xD5
    if sample < 0:
        mask = 0x55
        sample = -sample - 1
    sample = min(sample, 0x7FFF)

    if sample < 256:
        segment = 0
        quantized = sample >> 4
    else:
        segment = _alaw_segment(sample)
        quantized = (sample >> (segment + 3)) & 0x0F
    return ((segment << 4) | quantized) ^ mask


def _alaw_to_linear16(value: int) -> int:
    value ^= 0x55
    sample = (value & 0x0F) << 4
    segment = (value & 0x70) >> 4
    if segment == 0:
        sample += 8
    elif segment == 1:
        sample += 0x108
    else:
        sample += 0x108
        sample <<= segment - 1
    return sample if value & 0x80 else -sample


def _alaw_segment(sample: int) -> int:
    for segment, end in enumerate((0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF, 0x3FFF, 0x7FFF)):
        if sample <= end:
            return segment
    return 7
