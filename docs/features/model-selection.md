# Model Selection Feature

## Overview
The Text Harvester supports multiple AI providers for OCR processing, allowing users to choose between different models based on their specific needs.

## Supported Models

### **OpenAI GPT-5** (Recommended)
- **Best for**: Monument photos, weathered text, challenging images, monument classification
- **Strengths**: Excellent OCR accuracy on weathered stone monuments; best results for DEBS classification
- **File Size Limit**: 20MB
- **Max Dimensions**: 3072px

### **Anthropic Claude 4 Sonnet**
- **Best for**: Clear images, high-quality documents
- **Strengths**: Good for well-lit, clear text
- **File Size Limit**: 5MB (with automatic optimization)
- **Max Dimensions**: 4096px

### **Google Gemini 3.1 Pro** (`gemini-3.1-pro-preview`)
- **Best for**: Clear images, structured documents, burial registers
- **Strengths**: Native JSON schema-constrained output; competitive pricing; local response caching
- **Cost model**: $1.25/M input tokens, $5.00/M output tokens
- **Model**: Configurable via `config.json` (`gemini.model`); also supports `gemini-2.5-flash` ($0.075/M input) for lower-cost runs
- **Note**: Unsupported JSON Schema keywords (`additionalProperties`, type arrays) are automatically stripped before sending to the API

### **Mistral OCR** (`mistral-ocr-latest` + `mistral-large-latest`)
- **Best for**: Handwritten historical documents, burial registers
- **Strengths**: Dedicated OCR model optimised for text extraction; two-step pipeline separates OCR from structuring
- **Pipeline**: `mistral-ocr-latest` extracts markdown text → `mistral-large-latest` structures into JSON
- **Cost model**: Per-page OCR cost ($0.002/page) + token costs for the chat structuring step
- See [Mistral OCR Provider](./mistral-ocr-provider.md) for full details

## How It Works

1. **Model Selection**: Users choose their preferred AI model on the upload page
2. **Automatic Optimization**: Images are automatically optimized based on provider limits
3. **Processing**: Selected model processes the image using provider-specific prompts
4. **Results**: Results include model information for tracking and analysis

## User Interface

- **Upload Page**: Model selection dropdown with recommendations
- **Processing Page**: Model-specific status messages and progress tracking
- **Results Page**: Model information displayed in results table and detail views
- **Exports**: Model data included in CSV/JSON exports

## Technical Implementation

- **Database**: Model information stored in `memorials` table
- **Processing**: Provider abstraction layer handles different AI services
- **Image Processing**: Automatic optimization based on provider requirements
- **Error Handling**: Robust error handling and fallback mechanisms

## Best Practices

- **Monument Photos**: Use GPT-5 for best results with weathered text
- **Clear Documents**: Either model works well for high-quality images
- **Large Files**: System automatically optimizes for provider limits
- **Batch Processing**: Same model used for all files in a batch

## Research Background

Provider selection decisions are informed by [socOCRbench](https://noahdasanaike.github.io/posts/sococrbench.html) (Dasanaike, updated February 2026), a benchmark of ~64 OCR models on social science documents including handwritten text, tables, and printed text across multiple geographic regions. Key findings relevant to TextHarvester:

- **VLMs dominate on handwriting**: Gemini 3.1 Pro (NES 0.893), Claude 3.5 Sonnet (0.876), and GPT-4V (0.812) significantly outperform traditional OCR systems (Tesseract 0.498, EasyOCR 0.634) on handwritten documents — the primary document type in TextHarvester's burial registers.
- **Gemini leads on tables**: Gemini 3.1 Pro tops the table extraction leaderboard (TEDS 0.868), making it well-suited for structured burial register pages.
- **Cost-performance standout**: Gemini 3 Flash achieves competitive handwriting scores (NES 0.844) at $0.0001/image vs $0.011 for GPT-4V, making it a strong option for high-volume batch processing.
- **Printed text converges**: On printed stone inscriptions, all major VLMs score 0.96+, so model choice matters less for clear monument photographs.

Note: Mistral OCR (`mistral-ocr-latest`) ranks 26th on the full socOCRbench leaderboard (64 models) and is the highest-ranked EU-based model (all models above it are from US or Chinese providers). Its inclusion in TextHarvester is motivated by its specialised text-extraction architecture for handwritten historical documents rather than raw benchmark ranking.

---

*This feature is fully implemented and production-ready.*
