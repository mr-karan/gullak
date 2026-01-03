"""Tests for media processor."""

import base64

import pytest

from gullak.media.models import MediaType
from gullak.media.processor import MediaProcessor


class TestMediaProcessor:
    """Tests for the MediaProcessor class."""

    @pytest.fixture
    def processor(self):
        """Fixture for MediaProcessor instance."""
        return MediaProcessor()

    @pytest.fixture
    def sample_image_bytes(self):
        """Create sample JPEG bytes."""
        # Simple 1x1 JPEG
        return base64.b64decode(
            "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
        )

    @pytest.fixture
    def sample_pdf_bytes(self):
        """Create sample PDF bytes."""
        return b"%PDF-1.4\n%..."

    def test_detect_mime_type_jpeg(self, processor, sample_image_bytes):
        """Test detection of JPEG MIME type."""
        mime_type = processor.detect_mime_type(sample_image_bytes)
        assert mime_type == "image/jpeg"

    def test_detect_mime_type_pdf(self, processor, sample_pdf_bytes):
        """Test detection of PDF MIME type."""
        mime_type = processor.detect_mime_type(sample_pdf_bytes)
        assert mime_type == "application/pdf"

    def test_detect_mime_type_unknown(self, processor):
        """Test detection of unknown MIME type."""
        mime_type = processor.detect_mime_type(b"invalid data")
        assert mime_type is None

    def test_validate_file_valid_image(self, processor, sample_image_bytes):
        """Test validation of valid image."""
        is_valid, error = processor.validate_file(sample_image_bytes)
        assert is_valid
        assert error is None

    def test_validate_file_valid_pdf(self, processor, sample_pdf_bytes):
        """Test validation of valid PDF."""
        is_valid, error = processor.validate_file(sample_pdf_bytes)
        assert is_valid
        assert error is None

    def test_validate_file_empty(self, processor):
        """Test validation of empty file."""
        is_valid, error = processor.validate_file(b"")
        assert not is_valid
        assert error == "Empty file"

    def test_validate_file_unknown_type(self, processor):
        """Test validation of unknown file type."""
        is_valid, error = processor.validate_file(b"unknown data")
        assert not is_valid
        assert "Could not determine file type" in error

    def test_validate_file_size_limit(self, processor):
        """Test file size limit validation."""
        # Create processor with small limit
        small_processor = MediaProcessor(max_image_size=10)

        # Create dummy JPEG larger than 10 bytes
        large_data = b"\xff\xd8\xff" + b"0" * 20

        is_valid, error = small_processor.validate_file(large_data)
        assert not is_valid
        assert "Image too large" in error

    def test_create_media_file(self, processor, sample_image_bytes):
        """Test creation of MediaFile object."""
        media_file = processor.create_media_file(sample_image_bytes, filename="test.jpg")

        assert media_file.mime_type == "image/jpeg"
        assert media_file.media_type == MediaType.IMAGE
        assert media_file.filename == "test.jpg"
        assert media_file.size_bytes == len(sample_image_bytes)

    def test_encode_for_llm(self, processor, sample_image_bytes):
        """Test encoding for LLM consumption."""
        media_file = processor.create_media_file(sample_image_bytes)
        content = processor.encode_for_llm(media_file)

        assert content.type == "image_url"
        assert content.image_url["url"].startswith("data:image/jpeg;base64,")

    def test_process_and_encode_success(self, processor, sample_image_bytes):
        """Test full processing pipeline success."""
        content, error = processor.process_and_encode(sample_image_bytes, filename="receipt.jpg")

        assert error is None
        assert content is not None
        assert content.type == "image_url"
        assert "url" in content.image_url

    def test_process_and_encode_failure(self, processor):
        """Test full processing pipeline failure."""
        content, error = processor.process_and_encode(b"invalid")

        assert content is None
        assert error is not None
