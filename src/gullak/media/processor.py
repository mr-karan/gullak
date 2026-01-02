"""Media processor for handling receipt images and PDFs."""

import base64
import logging
from io import BytesIO

from .models import MediaContent, MediaFile, MediaType

logger = logging.getLogger(__name__)

# Magic bytes for file type detection
MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"RIFF": "image/webp",  # WebP starts with RIFF
    b"%PDF": "application/pdf",
}


class MediaProcessor:
    """Handles media file validation, processing, and encoding for LLM."""

    DEFAULT_MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
    DEFAULT_MAX_PDF_SIZE = 10 * 1024 * 1024  # 10MB

    ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
    ALLOWED_PDF_TYPES = {"application/pdf"}

    def __init__(
        self,
        max_image_size: int = DEFAULT_MAX_IMAGE_SIZE,
        max_pdf_size: int = DEFAULT_MAX_PDF_SIZE,
    ) -> None:
        self.max_image_size = max_image_size
        self.max_pdf_size = max_pdf_size

    def detect_mime_type(self, data: bytes) -> str | None:
        """Detect MIME type from magic bytes."""
        for magic, mime_type in MAGIC_BYTES.items():
            if data.startswith(magic):
                return mime_type

        # Special case for WebP (RIFF....WEBP)
        if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
            return "image/webp"

        return None

    def validate_file(self, data: bytes, mime_type: str | None = None) -> tuple[bool, str | None]:
        """
        Validate a media file for type and size.

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not data:
            return False, "Empty file"

        # Detect or verify MIME type
        detected_mime = self.detect_mime_type(data)

        if mime_type is None:
            mime_type = detected_mime

        if detected_mime and detected_mime != mime_type:
            logger.warning(f"MIME type mismatch: declared={mime_type}, detected={detected_mime}")
            mime_type = detected_mime

        if mime_type is None:
            return False, "Could not determine file type"

        # Check if type is allowed
        is_image = mime_type in self.ALLOWED_IMAGE_TYPES
        is_pdf = mime_type in self.ALLOWED_PDF_TYPES

        if not is_image and not is_pdf:
            allowed = ", ".join(self.ALLOWED_IMAGE_TYPES | self.ALLOWED_PDF_TYPES)
            return False, f"Unsupported file type: {mime_type}. Allowed: {allowed}"

        # Check size limits
        size = len(data)

        if is_image and size > self.max_image_size:
            max_mb = self.max_image_size / (1024 * 1024)
            return False, f"Image too large. Maximum size: {max_mb:.0f}MB"

        if is_pdf and size > self.max_pdf_size:
            max_mb = self.max_pdf_size / (1024 * 1024)
            return False, f"PDF too large. Maximum size: {max_mb:.0f}MB"

        return True, None

    def create_media_file(
        self,
        data: bytes,
        mime_type: str | None = None,
        filename: str | None = None,
    ) -> MediaFile:
        """Create a MediaFile from raw bytes."""
        if mime_type is None:
            mime_type = self.detect_mime_type(data) or "application/octet-stream"

        media_type = MediaType.PDF if mime_type == "application/pdf" else MediaType.IMAGE

        return MediaFile(
            data=data,
            mime_type=mime_type,
            filename=filename,
            size_bytes=len(data),
            media_type=media_type,
        )

    def encode_for_llm(self, media_file: MediaFile) -> MediaContent:
        """
        Encode a media file as base64 data URI for LiteLLM.

        Works for both images and PDFs (Gemini supports PDF natively).
        """
        encoded = base64.b64encode(media_file.data).decode("utf-8")
        data_uri = f"data:{media_file.mime_type};base64,{encoded}"

        return MediaContent.from_base64(data_uri)

    def process_and_encode(
        self,
        data: bytes,
        mime_type: str | None = None,
        filename: str | None = None,
    ) -> tuple[MediaContent | None, str | None]:
        """
        Validate, process, and encode media in one step.

        Returns:
            Tuple of (MediaContent or None, error_message or None)
        """
        # Validate first
        is_valid, error = self.validate_file(data, mime_type)
        if not is_valid:
            return None, error

        # Create media file
        media_file = self.create_media_file(data, mime_type, filename)

        # Encode for LLM
        content = self.encode_for_llm(media_file)

        return content, None
