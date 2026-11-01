from __future__ import annotations

import base64
import socket
import time


UDP_PAIRING_PORT = 8899
HAP_PREFIX = "HAP-"
WEB_KEY = "iyy18m8d25h9care"
ANDROID_SYS = "ANDROID"


def build_qr_pairing_payload(ssid: str, password: str) -> str:
    if password:
        return f"S{ssid}\n{password}"
    return f"S{ssid}\n\n"


def did_from_hap_ssid(ssid: str) -> str:
    normalized = ssid.strip().strip('"')
    if not normalized.startswith(HAP_PREFIX) or len(normalized) <= len(HAP_PREFIX):
        raise ValueError(f"expected an SSID starting with {HAP_PREFIX!r}")
    return normalized[len(HAP_PREFIX) :].strip()


def parse_udp_pairing_announcement(message: str) -> str | None:
    if not message.startswith("iotcare_lan"):
        return None
    did = message.replace("iotcare_lan", "", 1).replace(":", "", 1).strip()
    return did or None


def listen_for_udp_pairing_announcement(
    *,
    bind_host: str = "0.0.0.0",
    port: int = UDP_PAIRING_PORT,
    timeout: float = 60.0,
) -> str | None:
    deadline = time.monotonic() + timeout
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((bind_host, int(port)))
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            sock.settimeout(remaining)
            try:
                data, _addr = sock.recvfrom(100)
            except socket.timeout:
                return None
            did = parse_udp_pairing_announcement(data.decode("utf-8", errors="replace"))
            if did:
                return did


def encrypt_web_value(value: str, *, key: str = WEB_KEY) -> str:
    encrypted = _aes_128_ecb_encrypt(_pkcs7_pad(value.encode("utf-8")), key.encode("utf-8"))
    return base64.b64encode(encrypted).decode("ascii")


def decrypt_web_value(value: str, *, key: str = WEB_KEY) -> str:
    decrypted = _aes_128_ecb_decrypt(base64.b64decode(value), key.encode("utf-8"))
    return _pkcs7_unpad(decrypted).decode("utf-8")


def build_cloud_check_did_form(ssid: str, password: str, *, token: str) -> dict[str, str]:
    return {
        "relatInfo": f"{ssid}&{password}",
        "tk": token,
        "sys": ANDROID_SYS,
    }


def build_cloud_add_device_form(
    *,
    did: str,
    password: str,
    device_type: str | int,
    token: str,
    name: str = "AP mode device",
    is_ai_voice: bool = False,
    is_cloud: bool = True,
) -> dict[str, str]:
    device_type_text = str(device_type)
    return {
        "utoken": token,
        "did": encrypt_web_value(did),
        "name": name,
        "type": device_type_text,
        "pwd": encrypt_web_value(password),
        "brand": "1",
        "isAiVoice": "1" if is_ai_voice else "0",
        "isCloud": _cloud_flag(device_type_text, is_cloud=is_cloud),
        "sys": ANDROID_SYS,
    }


def _cloud_flag(device_type: str, *, is_cloud: bool) -> str:
    if _is_lte_device_type(device_type):
        return "1" if is_cloud else "2"
    if _is_nvr_device_type(device_type):
        return "2"
    return "1"


def _is_nvr_device_type(device_type: str) -> bool:
    return device_type == "39"


def _is_lte_device_type(device_type: str) -> bool:
    return device_type in {"09", "18", "19", "24", "32"}


def _pkcs7_pad(data: bytes, block_size: int = 16) -> bytes:
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len]) * pad_len


def _pkcs7_unpad(data: bytes, block_size: int = 16) -> bytes:
    if not data or len(data) % block_size:
        raise ValueError("invalid PKCS#7 data length")
    pad_len = data[-1]
    if pad_len < 1 or pad_len > block_size or data[-pad_len:] != bytes([pad_len]) * pad_len:
        raise ValueError("invalid PKCS#7 padding")
    return data[:-pad_len]


def _aes_128_ecb_encrypt(data: bytes, key: bytes) -> bytes:
    _validate_aes_key(key)
    try:
        from Crypto.Cipher import AES

        return AES.new(key, AES.MODE_ECB).encrypt(data)
    except ImportError:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        encryptor = Cipher(algorithms.AES(key), modes.ECB()).encryptor()
        return encryptor.update(data) + encryptor.finalize()


def _aes_128_ecb_decrypt(data: bytes, key: bytes) -> bytes:
    _validate_aes_key(key)
    try:
        from Crypto.Cipher import AES

        return AES.new(key, AES.MODE_ECB).decrypt(data)
    except ImportError:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        decryptor = Cipher(algorithms.AES(key), modes.ECB()).decryptor()
        return decryptor.update(data) + decryptor.finalize()


def _validate_aes_key(key: bytes) -> None:
    if len(key) != 16:
        raise ValueError("APK AesC web key must be 16 bytes")
