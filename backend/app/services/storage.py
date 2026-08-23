"""Media storage for field-report photos.

Local-disk implementation used for the demo: files are written under
``settings.MEDIA_ROOT`` and served back as static files at
``settings.MEDIA_URL_PREFIX``. A MinIO/S3 backend is left as an integration-ready
seam (§9) — swap :class:`LocalStorage` for an S3 implementation of the same tiny
interface without touching the API layer.

Uploads are validated defensively (§14): an allow-list of image content types,
a hard size cap, and a magic-byte sniff so a renamed executable can't pose as an
image. Stored filenames are random (UUID) — the client-supplied filename never
touches the filesystem path, so there is no path-traversal surface.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.config import Settings

# Allowed image types → canonical file extension. Anything else is rejected.
ALLOWED_IMAGE_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

# Leading "magic" bytes for each accepted format (defence against a renamed
# non-image file). WebP is a RIFF container: "RIFF"???? "WEBP".
_MAGIC = {
    "image/jpeg": lambda b: b[:3] == b"\xff\xd8\xff",
    "image/png": lambda b: b[:8] == b"\x89PNG\r\n\x1a\n",
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}


class StorageError(ValueError):
    """Raised when an upload fails validation or cannot be stored."""


@dataclass
class StoredObject:
    """Result of persisting one media object."""

    storage_key: str  # path relative to the media root, also the URL suffix
    url: str          # public URL (served via StaticFiles)
    content_type: str
    size_bytes: int
    checksum: str     # sha256 hex


class Storage(Protocol):
    """Minimal object-storage interface (local now, S3/MinIO later)."""

    def save_image(self, data: bytes, content_type: str, *, prefix: str) -> StoredObject:
        ...


def validate_image(data: bytes, content_type: str | None, max_bytes: int) -> str:
    """Validate an uploaded image; return the normalized content type.

    Raises :class:`StorageError` with a human message on any failure so the API
    can surface a 400. Checks, in order: non-empty, size cap, content-type
    allow-list, and magic-byte signature match (§14).
    """

    if not data:
        raise StorageError("Empty file.")
    if len(data) > max_bytes:
        mb = max_bytes / (1024 * 1024)
        raise StorageError(f"File too large (limit {mb:.0f} MB).")

    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype not in ALLOWED_IMAGE_TYPES:
        allowed = ", ".join(sorted(ALLOWED_IMAGE_TYPES))
        raise StorageError(f"Unsupported type '{ctype or 'unknown'}'. Allowed: {allowed}.")

    if not _MAGIC[ctype](data):
        raise StorageError("File content does not match its declared image type.")

    return ctype


class LocalStorage:
    """Persist media on the local filesystem under a media root."""

    def __init__(self, settings: Settings) -> None:
        self._root = Path(settings.MEDIA_ROOT)
        self._url_prefix = settings.MEDIA_URL_PREFIX.rstrip("/")
        self._max_bytes = settings.MAX_UPLOAD_BYTES

    @property
    def max_bytes(self) -> int:
        return self._max_bytes

    def save_image(self, data: bytes, content_type: str, *, prefix: str) -> StoredObject:
        """Validate then write ``data`` under ``prefix``; return its metadata."""

        ctype = validate_image(data, content_type, self._max_bytes)
        ext = ALLOWED_IMAGE_TYPES[ctype]

        safe_prefix = prefix.strip("/") or "misc"
        name = f"{uuid.uuid4().hex}{ext}"
        rel_key = f"{safe_prefix}/{name}"

        dest = self._root / safe_prefix / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

        return StoredObject(
            storage_key=rel_key,
            url=f"{self._url_prefix}/{rel_key}",
            content_type=ctype,
            size_bytes=len(data),
            checksum=hashlib.sha256(data).hexdigest(),
        )


def get_storage(settings: Settings) -> Storage:
    """Return the configured storage backend (local for the demo)."""

    return LocalStorage(settings)
