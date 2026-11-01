from __future__ import annotations

from enum import IntEnum
import struct


class Direction(IntEnum):
    STOP = 0
    UP = 1
    DOWN = 2
    LEFT = 3
    UP_LEFT = 4
    DOWN_LEFT = 5
    RIGHT = 6
    UP_RIGHT = 7
    DOWN_RIGHT = 8


COMMAND_PTZ = 0x1001
COMMAND_LIVE_START = 0x0001
COMMAND_LIVE_STOP = 0x0003
COMMAND_AUDIO_START = 0x0004
COMMAND_AUDIO_STOP = 0x0005
COMMAND_SPEAKER_START = 0x0006
COMMAND_SPEAKER_STOP = 0x0007
COMMAND_LOGIN = 0x0010
COMMAND_SET_WIFI = 0x0342
COMMAND_SET_POSITION = 0x1008
COMMAND_ADJUST = 0x100C
COMMAND_ORIGIN = 0x100E
COMMAND_SET_RECORD_MODE = 0x0310
COMMAND_SET_MOTION_DETECT = 0x0324
COMMAND_GET_DEVICE_INFO = 0x0330
COMMAND_SET_TIMEZONE = 0x0473
COMMAND_SET_VOLUME = 0x811A
COMMAND_SET_DEVICE_VOICE = 0x81CA
COMMAND_GET_DEVICE_VOICE = 0x81CC

CMD_CHANNEL_MAGIC = 0x76768888

VIDEO_FRAME_FLAG = 428216305
AUDIO_FRAME_FLAG = 428216306
START_FRAME_FLAG = 428213528
END_FRAME_FLAG = 553649432
TARGET_FRAME_FLAG = 428213536
AUDIO_G711A_CODEC = 82
VIDEO_CODEC_H264 = 3
VIDEO_CODEC_H265 = 5
VFRAME_OTHER = 0
VFRAME_H264_I = 1
VFRAME_H264_P = 2
VFRAME_H264_B = 3
VFRAME_H265_I = 17
VFRAME_H265_P = 18
VFRAME_H265_B = 19


def _byte(value: int, name: str) -> int:
    if not 0 <= int(value) <= 0xFF:
        raise ValueError(f"{name} must fit in an unsigned byte")
    return int(value)


def _int16(value: int, name: str) -> int:
    if not -0x8000 <= int(value) <= 0x7FFF:
        raise ValueError(f"{name} must fit in a signed 16-bit integer")
    return int(value)


def build_ptz_payload(
    direction: Direction | int | str,
    *,
    speed: int = 0,
    channel: int = 0,
    reserved: int = 0,
) -> bytes:
    """Build APK-compatible `IOTYPE_USER_IPCAM_PTZ_COMMAND` payload bytes."""
    if isinstance(direction, str):
        direction = parse_direction(direction)
    direction_value = _byte(int(direction), "direction")
    return struct.pack(
        "<BBBBBBBB",
        direction_value,
        0x08,
        0,
        0,
        0,
        _byte(speed, "speed"),
        _byte(channel, "channel"),
        _byte(reserved, "reserved"),
    )


def build_set_position_payload(x: int, y: int) -> bytes:
    return struct.pack("<Ihh", 1, _int16(x, "x"), _int16(y, "y"))


def _fixed_ascii_field(value: str, size: int, name: str) -> bytes:
    encoded = value.encode("utf-8")
    if len(encoded) > size:
        raise ValueError(f"{name} must fit in {size} bytes when UTF-8 encoded")
    return encoded.ljust(size, b"\x00")


def build_set_wifi_payload(ssid: str, password: str, *, mode: int = 1, reserved: int = 0) -> bytes:
    """Build APK-compatible `IOTYPE_USER_IPCAM_SETWIFI` payload bytes."""
    return b"".join(
        (
            _fixed_ascii_field(ssid, 0x20, "ssid"),
            _fixed_ascii_field(password, 0x20, "password"),
            struct.pack("<BB", _byte(mode, "mode"), _byte(reserved, "reserved")),
            b"\x00" * 10,
        )
    )


def build_login_payload(password: str | bytes, *, share: bool = False, user_id: int = 0) -> bytes:
    """Build APK-compatible `IOCTRL_DEV_LOGIN` payload bytes."""
    password_bytes = password if isinstance(password, bytes) else password.encode("utf-8")
    if len(password_bytes) > 64:
        raise ValueError("password must fit in 64 bytes when UTF-8 encoded")
    return b"".join(
        (
            password_bytes.ljust(64, b"\x00"),
            bytes((0xEF if share else 0,)),
            b"\x00" * 3,
            struct.pack("<I", int(user_id)),
        )
    )


def build_live_start_payload(
    resolution: int = 1,
    stream_type: int = 2,
    channel: int = 0,
    *,
    profile: int | None = None,
    extra: bytes | None = None,
) -> bytes:
    """Build APK-compatible `IOCTRL_TYPE_LIVE_START_REQ` payload bytes."""
    payload = struct.pack("<III", int(resolution), int(stream_type), int(channel)) + (b"\x00" * 8)
    if profile is not None:
        profile_map = {
            0: 224,
            1: 0xC0,
            2: 0x9E,
            3: 100,
        }
        payload = payload[:16] + bytes((_byte(profile_map.get(int(profile), int(profile)), "profile"),)) + payload[17:]
    if extra is not None:
        if len(extra) > 64:
            raise ValueError("extra live payload data must fit in 64 bytes")
        payload += extra.ljust(64, b"\x00")
    return payload


def build_live_stop_payload() -> bytes:
    return struct.pack("<I", 0)


def build_audio_control_payload(channel: int = 0) -> bytes:
    return struct.pack("<I", int(channel))


def build_speaker_start_payload() -> bytes:
    return struct.pack("<III4x", 0, AUDIO_G711A_CODEC, 320)


def build_speaker_stop_payload() -> bytes:
    return struct.pack("<I", 0)


def build_adjust_payload(mode: int, x: int, y: int) -> bytes:
    return struct.pack("<Ihh", int(mode), _int16(x, "x"), _int16(y, "y"))


def build_origin_payload(value: int = 1) -> bytes:
    return struct.pack("<I", int(value))


def build_get_device_info_payload() -> bytes:
    return struct.pack("<I", 0)


def build_set_volume_payload(audio_in: int, audio_out: int) -> bytes:
    return struct.pack("<II", int(audio_in), int(audio_out))


def build_set_record_mode_payload(record_type: int, *, enabled: bool) -> bytes:
    return struct.pack("<III", 0, int(record_type), 1 if enabled else 0)


def build_set_motion_detect_payload(channel: int, sensitivity: int) -> bytes:
    return struct.pack("<II", int(channel), int(sensitivity))


def build_set_device_voice_payload(code: str) -> bytes:
    encoded = code.encode("utf-8")
    if len(encoded) > 8:
        raise ValueError("voice code must fit in 8 bytes when UTF-8 encoded")
    return encoded.ljust(8, b"\x00")


def build_get_device_voice_payload() -> bytes:
    return b"\x00" * 8


def build_set_timezone_payload(
    *,
    gmt_offset_hours: int,
    local_time: str | bytes,
    gmt_remainder_ms: int = 0,
    dst_on: int = 0,
) -> bytes:
    time_bytes = local_time if isinstance(local_time, bytes) else local_time.encode("utf-8")
    if len(time_bytes) > 256:
        raise ValueError("local_time must fit in 256 bytes when UTF-8 encoded")
    payload = bytearray(276)
    struct.pack_into("<IIi", payload, 0, 276, 0, int(gmt_offset_hours))
    payload[12 : 12 + len(time_bytes)] = time_bytes
    struct.pack_into("<II", payload, 268, int(gmt_remainder_ms), int(dst_on))
    return bytes(payload)


def build_command_frame(command_id: int, payload: bytes, *, sub: int | None = None) -> bytes:
    if sub is None:
        header = struct.pack("<IIIIII", CMD_CHANNEL_MAGIC, len(payload), int(command_id), 0, 0, 0)
    else:
        header = struct.pack("<IIII", CMD_CHANNEL_MAGIC, len(payload), int(command_id), 0)
        header += bytes((_byte(sub, "sub"),)) + (b"\x00" * 7)
    return header + payload


class CommandFrameHeader:
    def __init__(self, *, payload_length: int, command_id: int, sub: int) -> None:
        self.payload_length = payload_length
        self.command_id = command_id
        self.sub = sub


def parse_command_frame_header(header: bytes) -> CommandFrameHeader:
    if len(header) != 24:
        raise ValueError("command frame header must be exactly 24 bytes")
    magic, payload_length, command_id, _reserved0 = struct.unpack("<IIII", header[:16])
    if magic != CMD_CHANNEL_MAGIC:
        raise ValueError(f"unexpected command frame magic 0x{magic:08x}")
    return CommandFrameHeader(payload_length=payload_length, command_id=command_id, sub=header[16])


class LoginResponse:
    def __init__(self, *, ret: int, rev_ex: bytes, token: int, reserved: bytes) -> None:
        self.ret = ret
        self.rev_ex = rev_ex
        self.token = token
        self.reserved = reserved


def parse_login_response_payload(payload: bytes) -> LoginResponse:
    if len(payload) < 12:
        raise ValueError("login response payload must be at least 12 bytes")
    if len(payload) < 16:
        return LoginResponse(
            ret=struct.unpack("<i", payload[:4])[0],
            rev_ex=b"",
            token=struct.unpack("<I", payload[8:12])[0],
            reserved=payload[4:8],
        )
    return LoginResponse(
        ret=payload[4],
        rev_ex=payload[5:8],
        token=struct.unpack("<I", payload[8:12])[0],
        reserved=payload[12:16],
    )


class LiveStartResponse:
    def __init__(
        self,
        *,
        video_codec: int,
        video_width: int,
        video_height: int,
        audio_codec: int,
        result: int,
        reserved: bytes,
        sub: int,
    ) -> None:
        self.video_codec = video_codec
        self.video_width = video_width
        self.video_height = video_height
        self.audio_codec = audio_codec
        self.result = result
        self.reserved = reserved
        self.sub = sub


def parse_live_start_response_payload(payload: bytes) -> LiveStartResponse:
    if len(payload) < 24:
        raise ValueError("live start response payload must be at least 24 bytes")
    if len(payload) < 28:
        video_codec, width, height, audio_codec, result = struct.unpack("<IIIII", payload[:20])
        return LiveStartResponse(
            video_codec=video_codec,
            video_width=width,
            video_height=height,
            audio_codec=audio_codec,
            result=result,
            reserved=payload[20:24],
            sub=0,
        )
    video_codec, width, height, audio_codec, result = struct.unpack("<IIIII", payload[4:24])
    return LiveStartResponse(
        video_codec=video_codec,
        video_width=width,
        video_height=height,
        audio_codec=audio_codec,
        result=result,
        reserved=payload[24:28],
        sub=payload[28] if len(payload) >= 29 else 0,
    )


class ResultResponse:
    def __init__(self, *, result: int) -> None:
        self.result = result


def parse_result_response_payload(payload: bytes) -> ResultResponse:
    if len(payload) < 8:
        raise ValueError("result response payload must be at least 8 bytes")
    return ResultResponse(result=struct.unpack("<i", payload[4:8])[0])


def _decode_fixed_string(value: bytes) -> str:
    return value.split(b"\x00", 1)[0].decode("utf-8", errors="replace")


class DeviceInfoResponse:
    def __init__(
        self,
        *,
        model: str,
        vendor: str,
        version: int,
        channel: int,
        total: int,
        free: int,
        v1: int,
        v2: int,
        v3: int,
        reserved: bytes,
        dev_flag: int,
    ) -> None:
        self.model = model
        self.vendor = vendor
        self.version = version
        self.channel = channel
        self.total = total
        self.free = free
        self.v1 = v1
        self.v2 = v2
        self.v3 = v3
        self.reserved = reserved
        self.dev_flag = dev_flag
        feature_byte = reserved[1]
        self.is_have_tf = total > 0
        self.is_4g_support_cloud = (feature_byte & 0x80) == 0x80
        self.is_support_h265 = (feature_byte & 0x40) == 0x40
        self.is_support_download = (feature_byte & 0x08) == 0x08
        self.is_have_baidu_ai = (dev_flag & 1) == 1
        self.tf_is_anomaly = total < 0


def parse_device_info_response_payload(payload: bytes) -> DeviceInfoResponse:
    """Parse APK `IOTYPE_USER_IPCAM_DEVINFO_RESP` payload bytes."""
    if len(payload) < 60:
        raise ValueError("device info response payload must be at least 60 bytes")
    dev_flag = struct.unpack("<I", payload[60:64])[0] if len(payload) >= 64 else 0
    return DeviceInfoResponse(
        model=_decode_fixed_string(payload[4:20]),
        vendor=_decode_fixed_string(payload[20:36]),
        version=struct.unpack("<I", payload[36:40])[0],
        channel=struct.unpack("<I", payload[40:44])[0],
        total=struct.unpack("<i", payload[44:48])[0],
        free=struct.unpack("<i", payload[48:52])[0],
        v1=struct.unpack("<h", payload[52:54])[0],
        v2=struct.unpack("<h", payload[54:56])[0],
        v3=struct.unpack("<h", payload[56:58])[0],
        reserved=payload[58:60],
        dev_flag=dev_flag,
    )


class DeviceVoiceResponse:
    def __init__(self, *, state: int, voice_code: bytes) -> None:
        self.state = state
        self.voice_code = voice_code
        self.code = _decode_fixed_string(voice_code[:2])


def parse_device_voice_response_payload(payload: bytes) -> DeviceVoiceResponse:
    """Parse APK `IOTYPE_USER_GET_DEVICE_VOICE_RESP` payload bytes."""
    if len(payload) < 16:
        raise ValueError("device voice response payload must be at least 16 bytes")
    return DeviceVoiceResponse(
        state=struct.unpack("<i", payload[4:8])[0],
        voice_code=payload[8:16],
    )


class LiveAVFrameHeader:
    def __init__(
        self,
        *,
        flag: int,
        length: int,
        pts: int,
        frame_type: int,
        frame_count: int,
        online_count: int,
        codec_id: int,
        reserved: bytes,
    ) -> None:
        self.flag = flag
        self.length = length
        self.pts = pts
        self.frame_type = frame_type
        self.frame_count = frame_count
        self.online_count = online_count
        self.codec_id = codec_id
        self.reserved = reserved
        self.sub = reserved[1]


def parse_live_av_frame_header(header: bytes) -> LiveAVFrameHeader:
    """Parse the 32-byte `LiveAVFrame` header used on PPCS live channel 2."""
    if len(header) != 32:
        raise ValueError("live AV frame header must be exactly 32 bytes")
    flag, length, pts, frame_type, frame_count, online_count, codec_id = struct.unpack("<IIIIIII", header[:28])
    return LiveAVFrameHeader(
        flag=flag,
        length=length,
        pts=pts,
        frame_type=frame_type,
        frame_count=frame_count,
        online_count=online_count,
        codec_id=codec_id,
        reserved=header[28:32],
    )


def build_audio_frame(data: bytes, *, pts: int = 0, codec_id: int = AUDIO_G711A_CODEC) -> bytes:
    """Build APK-compatible microphone/talk payload for PPCS talk channel 1."""
    return struct.pack("<IIII", AUDIO_FRAME_FLAG, len(data), int(pts), int(codec_id)) + data


def parse_direction(value: str) -> Direction:
    key = value.strip().lower().replace("_", "-")
    aliases = {
        "stop": Direction.STOP,
        "none": Direction.STOP,
        "up": Direction.UP,
        "forward": Direction.UP,
        "down": Direction.DOWN,
        "back": Direction.DOWN,
        "backward": Direction.DOWN,
        "left": Direction.LEFT,
        "up-left": Direction.UP_LEFT,
        "forward-left": Direction.UP_LEFT,
        "down-left": Direction.DOWN_LEFT,
        "back-left": Direction.DOWN_LEFT,
        "right": Direction.RIGHT,
        "up-right": Direction.UP_RIGHT,
        "forward-right": Direction.UP_RIGHT,
        "down-right": Direction.DOWN_RIGHT,
        "back-right": Direction.DOWN_RIGHT,
    }
    try:
        return aliases[key]
    except KeyError as exc:
        valid = ", ".join(sorted(aliases))
        raise ValueError(f"unknown direction {value!r}; expected one of: {valid}") from exc
