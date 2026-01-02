---
summary: "How to use the Receipt OCR and document processing features"
read_when:
  - You want to log expenses from images or PDFs
  - You want to know supported file types and limits
---

# Receipt OCR & Document Processing

Gullak supports multimodal input, allowing you to upload images of receipts, invoices, or bills. The AI agent extracts relevant details (payee, date, amount, category) and creates a transaction entry for you.

## Supported Formats

- **Images**: JPEG, PNG, WebP
- **Documents**: PDF
- **Size Limit**: 5MB for images, 10MB for PDFs (configurable via environment variables)

## Usage

### 1. Web Interface

1.  Open the Gullak chat interface.
2.  Click the **Camera/Receipt Icon** next to the chat input (or the attachment clip).
3.  Select your receipt image or PDF.
4.  Optionally, add a text caption (e.g., "Lunch with team").
5.  Click **Send**.

The agent will analyze the visual content, extract the transaction details, and present a preview for your confirmation.

### 2. WhatsApp

1.  Open the chat with your Gullak bot.
2.  Send an image or PDF document directly.
3.  (Optional) Add a caption to the media message to provide extra context.
4.  The bot will reply with the extracted transaction details and ask for confirmation (if configured) or log it directly.

## Configuration

You can adjust the file size limits in your `.env` file:

```bash
# Increase image limit to 10MB
GULLAK_MEDIA_MAX_IMAGE_SIZE=10485760

# Increase PDF limit to 20MB
GULLAK_MEDIA_MAX_PDF_SIZE=20971520
```

## Privacy & Processing

- **Processing**: Media files are processed in-memory and converted to base64 data URIs. They are **not** stored permanently on the server disk.
- **AI Provider**: The image data is sent to your configured AI provider (e.g., Google Gemini, OpenAI, Anthropic) for analysis. Please review their data privacy policies regarding image uploads.
