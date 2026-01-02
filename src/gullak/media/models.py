"""Media models for handling images and documents."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MediaType(str, Enum):
    """Supported media types."""

    IMAGE = "image"
    PDF = "pdf"


class MediaFile(BaseModel):
    """Represents a media file with its metadata."""

    data: bytes
    mime_type: str
    filename: str | None = None
    size_bytes: int
    media_type: MediaType

    model_config = {"arbitrary_types_allowed": True}


class MediaContent(BaseModel):
    """LiteLLM-compatible media content format for multimodal messages."""

    type: str = Field(default="image_url")
    image_url: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_base64(cls, data_uri: str, detail: str = "auto") -> "MediaContent":
        """Create MediaContent from a base64 data URI."""
        return cls(type="image_url", image_url={"url": data_uri, "detail": detail})

    def to_message_content(self) -> dict[str, Any]:
        """Convert to LiteLLM message content format."""
        return {"type": self.type, "image_url": self.image_url}
