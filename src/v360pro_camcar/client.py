from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

from .ppcs_bridge import PPCS_COMMAND_CHANNEL, PPCS_LIVE_CHANNEL, PPCS_TALK_CHANNEL
from .protocol import (
    CommandFrameHeader,
    DeviceInfoResponse,
    DeviceVoiceResponse,
    LiveAVFrameHeader,
    LiveStartResponse,
    LoginResponse,
    ResultResponse,
    COMMAND_AUDIO_START,
    COMMAND_AUDIO_STOP,
    COMMAND_LIVE_START,
    COMMAND_LIVE_STOP,
    COMMAND_LOGIN,
    COMMAND_SPEAKER_START,
    COMMAND_SPEAKER_STOP,
    COMMAND_ADJUST,
    COMMAND_GET_DEVICE_INFO,
    COMMAND_GET_DEVICE_VOICE,
    COMMAND_ORIGIN,
    COMMAND_PTZ,
    COMMAND_SET_DEVICE_VOICE,
    COMMAND_SET_MOTION_DETECT,
    COMMAND_SET_RECORD_MODE,
    COMMAND_SET_TIMEZONE,
    COMMAND_SET_VOLUME,
    COMMAND_SET_WIFI,
    COMMAND_SET_POSITION,
    build_adjust_payload,
    build_audio_control_payload,
    build_audio_frame,
    build_command_frame,
    build_get_device_info_payload,
    build_get_device_voice_payload,
    build_live_start_payload,
    build_live_stop_payload,
    build_login_payload,
    build_origin_payload,
    build_ptz_payload,
    build_set_device_voice_payload,
    build_set_motion_detect_payload,
    build_set_position_payload,
    build_set_record_mode_payload,
    build_set_timezone_payload,
    build_set_volume_payload,
    build_set_wifi_payload,
    build_speaker_start_payload,
    build_speaker_stop_payload,
    parse_command_frame_header,
    parse_device_info_response_payload,
    parse_device_voice_response_payload,
    parse_live_av_frame_header,
    parse_live_start_response_payload,
    parse_login_response_payload,
    parse_result_response_payload,
)
from .transport import send_tcp

Sender = Callable[[str, int, bytes, float], int]
MAX_LIVE_FRAME_PAYLOAD_SIZE = 8 * 1024 * 1024


class PPCSWriter(Protocol):
    def write(self, session: int, channel: int, data: bytes) -> int: ...


class PPCSTransport(Protocol):
    def write(self, session: int, channel: int, data: bytes) -> int: ...

    def read(self, session: int, channel: int, size: int, *, timeout_ms: int = 10000) -> bytes: ...


@dataclass(frozen=True)
class LiveFrame:
    header: LiveAVFrameHeader
    payload: bytes


@dataclass(frozen=True)
class CommandResponse:
    header: CommandFrameHeader
    payload: bytes

    @property
    def command_id(self) -> int:
        return self.header.command_id

    @property
    def sub(self) -> int:
        return self.header.sub


@dataclass
class V360CamcarClient:
    sender: Sender = send_tcp

    def ptz_frame(self, direction: str | int, *, speed: int = 0, channel: int = 0) -> bytes:
        return build_command_frame(COMMAND_PTZ, build_ptz_payload(direction, speed=speed, channel=channel))

    def set_position_frame(self, x: int, y: int) -> bytes:
        return build_command_frame(COMMAND_SET_POSITION, build_set_position_payload(x, y))

    def set_wifi_frame(self, ssid: str, password: str, *, mode: int = 1, reserved: int = 0) -> bytes:
        return build_command_frame(
            COMMAND_SET_WIFI,
            build_set_wifi_payload(ssid, password, mode=mode, reserved=reserved),
        )

    def adjust_frame(self, mode: int, x: int, y: int) -> bytes:
        return build_command_frame(COMMAND_ADJUST, build_adjust_payload(mode, x, y))

    def origin_frame(self, value: int = 1) -> bytes:
        return build_command_frame(COMMAND_ORIGIN, build_origin_payload(value))

    def login_frame(self, password: str | bytes, *, share: bool = False, user_id: int = 0) -> bytes:
        return build_command_frame(COMMAND_LOGIN, build_login_payload(password, share=share, user_id=user_id))

    def live_start_frame(
        self,
        *,
        resolution: int = 1,
        stream_type: int = 2,
        channel: int = 0,
        profile: int | None = None,
        extra: bytes | None = None,
        sub: int | None = None,
    ) -> bytes:
        return build_command_frame(
            COMMAND_LIVE_START,
            build_live_start_payload(resolution, stream_type, channel, profile=profile, extra=extra),
            sub=sub,
        )

    def live_stop_frame(self, *, sub: int | None = None) -> bytes:
        return build_command_frame(COMMAND_LIVE_STOP, build_live_stop_payload(), sub=sub)

    def audio_start_frame(self, channel: int = 0) -> bytes:
        return build_command_frame(COMMAND_AUDIO_START, build_audio_control_payload(channel))

    def audio_stop_frame(self, channel: int = 0) -> bytes:
        return build_command_frame(COMMAND_AUDIO_STOP, build_audio_control_payload(channel))

    def speaker_start_frame(self, *, sub: int | None = None) -> bytes:
        return build_command_frame(COMMAND_SPEAKER_START, build_speaker_start_payload(), sub=sub)

    def speaker_stop_frame(self, *, sub: int | None = None) -> bytes:
        return build_command_frame(COMMAND_SPEAKER_STOP, build_speaker_stop_payload(), sub=sub)

    def get_device_info_frame(self) -> bytes:
        return build_command_frame(COMMAND_GET_DEVICE_INFO, build_get_device_info_payload())

    def set_volume_frame(self, audio_in: int, audio_out: int) -> bytes:
        return build_command_frame(COMMAND_SET_VOLUME, build_set_volume_payload(audio_in, audio_out))

    def set_record_mode_frame(self, record_type: int, *, enabled: bool) -> bytes:
        return build_command_frame(COMMAND_SET_RECORD_MODE, build_set_record_mode_payload(record_type, enabled=enabled))

    def set_motion_detect_frame(self, channel: int, sensitivity: int) -> bytes:
        return build_command_frame(COMMAND_SET_MOTION_DETECT, build_set_motion_detect_payload(channel, sensitivity))

    def set_timezone_frame(
        self,
        *,
        gmt_offset_hours: int,
        local_time: str | bytes,
        gmt_remainder_ms: int = 0,
        dst_on: int = 0,
    ) -> bytes:
        return build_command_frame(
            COMMAND_SET_TIMEZONE,
            build_set_timezone_payload(
                gmt_offset_hours=gmt_offset_hours,
                local_time=local_time,
                gmt_remainder_ms=gmt_remainder_ms,
                dst_on=dst_on,
            ),
        )

    def set_device_voice_frame(self, code: str) -> bytes:
        return build_command_frame(COMMAND_SET_DEVICE_VOICE, build_set_device_voice_payload(code))

    def get_device_voice_frame(self) -> bytes:
        return build_command_frame(COMMAND_GET_DEVICE_VOICE, build_get_device_voice_payload())

    def send_ptz_tcp(
        self,
        host: str,
        port: int,
        direction: str | int,
        *,
        speed: int = 0,
        channel: int = 0,
        timeout: float = 3.0,
    ) -> int:
        return self.sender(host, int(port), self.ptz_frame(direction, speed=speed, channel=channel), timeout)

    def send_frame_ppcs(
        self,
        bridge: PPCSWriter,
        session: int,
        frame: bytes,
        *,
        channel: int = PPCS_COMMAND_CHANNEL,
    ) -> int:
        return bridge.write(int(session), int(channel), frame)

    def send_ptz_ppcs(
        self,
        bridge: PPCSWriter,
        session: int,
        direction: str | int,
        *,
        speed: int = 0,
        channel: int = 0,
    ) -> int:
        return self.send_frame_ppcs(bridge, session, self.ptz_frame(direction, speed=speed, channel=channel))


@dataclass
class V360PPCSSession:
    bridge: PPCSTransport
    session: int
    client: V360CamcarClient = field(default_factory=V360CamcarClient)

    def write_command(self, frame: bytes) -> int:
        return self.bridge.write(self.session, PPCS_COMMAND_CHANNEL, frame)

    def login(self, password: str | bytes, *, share: bool = False, user_id: int = 0) -> int:
        return self.write_command(self.client.login_frame(password, share=share, user_id=user_id))

    def login_wait(
        self,
        password: str | bytes,
        *,
        share: bool = False,
        user_id: int = 0,
        timeout_ms: int = 10000,
    ) -> LoginResponse:
        self.login(password, share=share, user_id=user_id)
        return self.read_login_response(timeout_ms=timeout_ms)

    def drive(self, direction: str | int, *, speed: int = 0, channel: int = 0) -> int:
        return self.write_command(self.client.ptz_frame(direction, speed=speed, channel=channel))

    def start_live(
        self,
        *,
        resolution: int = 1,
        stream_type: int = 2,
        channel: int = 0,
        profile: int | None = None,
        extra: bytes | None = None,
        sub: int | None = None,
    ) -> int:
        return self.write_command(
            self.client.live_start_frame(
                resolution=resolution,
                stream_type=stream_type,
                channel=channel,
                profile=profile,
                extra=extra,
                sub=sub,
            )
        )

    def start_live_wait(
        self,
        *,
        resolution: int = 1,
        stream_type: int = 2,
        channel: int = 0,
        profile: int | None = None,
        extra: bytes | None = None,
        sub: int | None = None,
        timeout_ms: int = 10000,
    ) -> LiveStartResponse:
        self.start_live(
            resolution=resolution,
            stream_type=stream_type,
            channel=channel,
            profile=profile,
            extra=extra,
            sub=sub,
        )
        return self.read_live_start_response(timeout_ms=timeout_ms)

    def stop_live(self, *, sub: int | None = None) -> int:
        return self.write_command(self.client.live_stop_frame(sub=sub))

    def start_audio(self, channel: int = 0) -> int:
        return self.write_command(self.client.audio_start_frame(channel))

    def stop_audio(self, channel: int = 0) -> int:
        return self.write_command(self.client.audio_stop_frame(channel))

    def start_speaker(self, *, sub: int | None = None) -> int:
        return self.write_command(self.client.speaker_start_frame(sub=sub))

    def stop_speaker(self, *, sub: int | None = None) -> int:
        return self.write_command(self.client.speaker_stop_frame(sub=sub))

    def get_device_info(self) -> int:
        return self.write_command(self.client.get_device_info_frame())

    def set_volume(self, audio_in: int, audio_out: int) -> int:
        return self.write_command(self.client.set_volume_frame(audio_in, audio_out))

    def set_record_mode(self, record_type: int, *, enabled: bool) -> int:
        return self.write_command(self.client.set_record_mode_frame(record_type, enabled=enabled))

    def set_motion_detect(self, channel: int, sensitivity: int) -> int:
        return self.write_command(self.client.set_motion_detect_frame(channel, sensitivity))

    def set_timezone(
        self,
        *,
        gmt_offset_hours: int,
        local_time: str | bytes,
        gmt_remainder_ms: int = 0,
        dst_on: int = 0,
    ) -> int:
        return self.write_command(
            self.client.set_timezone_frame(
                gmt_offset_hours=gmt_offset_hours,
                local_time=local_time,
                gmt_remainder_ms=gmt_remainder_ms,
                dst_on=dst_on,
            )
        )

    def set_device_voice(self, code: str) -> int:
        return self.write_command(self.client.set_device_voice_frame(code))

    def get_device_voice(self) -> int:
        return self.write_command(self.client.get_device_voice_frame())

    def write_talk_audio(self, payload: bytes) -> int:
        return self.bridge.write(self.session, PPCS_TALK_CHANNEL, payload)

    def send_talk_audio(self, data: bytes, *, pts: int = 0) -> int:
        return self.write_talk_audio(build_audio_frame(data, pts=pts))

    def read_live_frame(self, *, timeout_ms: int = 10000) -> LiveFrame:
        header_bytes = self.bridge.read(self.session, PPCS_LIVE_CHANNEL, 32, timeout_ms=timeout_ms)
        header = parse_live_av_frame_header(header_bytes)
        if header.length > MAX_LIVE_FRAME_PAYLOAD_SIZE:
            raise ValueError(f"live frame payload too large: {header.length}")
        payload = self.bridge.read(self.session, PPCS_LIVE_CHANNEL, header.length, timeout_ms=timeout_ms)
        return LiveFrame(header=header, payload=payload)

    def read_command_response(self, *, timeout_ms: int = 10000) -> CommandResponse:
        header_bytes = self.bridge.read(self.session, PPCS_COMMAND_CHANNEL, 24, timeout_ms=timeout_ms)
        header = parse_command_frame_header(header_bytes)
        payload = self.bridge.read(self.session, PPCS_COMMAND_CHANNEL, header.payload_length, timeout_ms=timeout_ms)
        return CommandResponse(header=header, payload=payload)

    def read_login_response(self, *, timeout_ms: int = 10000) -> LoginResponse:
        return parse_login_response_payload(self.read_command_response(timeout_ms=timeout_ms).payload)

    def read_live_start_response(self, *, timeout_ms: int = 10000) -> LiveStartResponse:
        return parse_live_start_response_payload(self.read_command_response(timeout_ms=timeout_ms).payload)

    def read_result_response(self, *, timeout_ms: int = 10000) -> ResultResponse:
        return parse_result_response_payload(self.read_command_response(timeout_ms=timeout_ms).payload)

    def read_device_info_response(self, *, timeout_ms: int = 10000) -> DeviceInfoResponse:
        return parse_device_info_response_payload(self.read_command_response(timeout_ms=timeout_ms).payload)

    def read_device_voice_response(self, *, timeout_ms: int = 10000) -> DeviceVoiceResponse:
        return parse_device_voice_response_payload(self.read_command_response(timeout_ms=timeout_ms).payload)
