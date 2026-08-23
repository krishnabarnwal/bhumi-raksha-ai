"""Storage / upload-validation unit tests (§14) plus the priority blend.

Pure functions — no DB, no TestClient. Covers the defensive image checks
(size, content-type allow-list, magic-byte sniff), the round-trip through
LocalStorage (UUID filename, no path traversal), and the priority index blend.
"""

import struct
import zlib

import pytest

from app.api.priorities import PRIORITY_BY_LEVEL, _priority_index
from app.core.config import Settings
from app.models.base import RiskLevel
from app.services.storage import (
    ALLOWED_IMAGE_TYPES,
    LocalStorage,
    StorageError,
    validate_image,
)

MAX = 8 * 1024 * 1024


def _png() -> bytes:
    """A minimal but structurally valid 1x1 PNG."""

    def chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00"))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


def _jpeg() -> bytes:
    return b"\xff\xd8\xff\xe0" + b"\x00" * 32


def _webp() -> bytes:
    return b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 16


# --- validate_image ------------------------------------------------------


def test_valid_png_jpeg_webp_pass():
    assert validate_image(_png(), "image/png", MAX) == "image/png"
    assert validate_image(_jpeg(), "image/jpeg", MAX) == "image/jpeg"
    assert validate_image(_webp(), "image/webp", MAX) == "image/webp"


def test_content_type_is_normalized():
    # Charset params and case are stripped/normalized.
    assert validate_image(_png(), "IMAGE/PNG; charset=binary", MAX) == "image/png"


def test_empty_file_rejected():
    with pytest.raises(StorageError):
        validate_image(b"", "image/png", MAX)


def test_oversize_rejected():
    with pytest.raises(StorageError):
        validate_image(_png(), "image/png", max_bytes=8)


def test_disallowed_type_rejected():
    with pytest.raises(StorageError):
        validate_image(b"GIF89a" + b"\x00" * 16, "image/gif", MAX)


def test_magic_byte_mismatch_rejected():
    # Declared PNG but the bytes are not a PNG — the renamed-file attack.
    with pytest.raises(StorageError):
        validate_image(b"this is not a png", "image/png", MAX)


# --- LocalStorage round-trip --------------------------------------------


def test_local_storage_writes_and_returns_metadata(tmp_path):
    settings = Settings(MEDIA_ROOT=str(tmp_path), MEDIA_URL_PREFIX="/media")
    store = LocalStorage(settings)
    data = _png()

    obj = store.save_image(data, "image/png", prefix="field-reports/7")

    # Stored under the prefix with a random UUID name and the right extension.
    assert obj.storage_key.startswith("field-reports/7/")
    assert obj.storage_key.endswith(".png")
    assert obj.url == f"/media/{obj.storage_key}"
    assert obj.size_bytes == len(data)
    written = tmp_path / obj.storage_key
    assert written.is_file()
    assert written.read_bytes() == data


def test_local_storage_filenames_are_unique(tmp_path):
    settings = Settings(MEDIA_ROOT=str(tmp_path))
    store = LocalStorage(settings)
    a = store.save_image(_png(), "image/png", prefix="p")
    b = store.save_image(_png(), "image/png", prefix="p")
    assert a.storage_key != b.storage_key  # UUIDs, no client filename used


def test_local_storage_rejects_bad_upload(tmp_path):
    settings = Settings(MEDIA_ROOT=str(tmp_path))
    store = LocalStorage(settings)
    with pytest.raises(StorageError):
        store.save_image(b"nope", "image/png", prefix="p")


def test_allowed_types_have_extensions():
    for ctype, ext in ALLOWED_IMAGE_TYPES.items():
        assert ctype.startswith("image/")
        assert ext.startswith(".")


# --- priority blend ------------------------------------------------------


def test_priority_index_monotonic_in_population():
    # More people exposed at the same score => higher (or equal) priority index.
    assert _priority_index(60.0, 10000) >= _priority_index(60.0, 0)


def test_priority_index_monotonic_in_score():
    assert _priority_index(80.0, 5000) >= _priority_index(40.0, 5000)


def test_priority_index_population_capped():
    # Population weighting saturates at the 10k cap (max 2x multiplier).
    assert _priority_index(50.0, 10_000) == _priority_index(50.0, 10_000_000)


def test_priority_tiers_cover_all_levels():
    assert set(PRIORITY_BY_LEVEL) == set(RiskLevel)
    assert PRIORITY_BY_LEVEL[RiskLevel.red] == "P1"
    assert PRIORITY_BY_LEVEL[RiskLevel.green] == "P4"
