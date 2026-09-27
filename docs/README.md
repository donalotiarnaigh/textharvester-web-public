# Text Harvester Documentation

This directory contains comprehensive documentation for the Text Harvester web application.

## Core Reference

- [Architecture Overview](./ARCHITECTURE.md) — system diagram, data flow, module map
- [API Reference](./API.md) — all ~40 endpoints with request/response schemas
- [Configuration Reference](./CONFIG.md) — every `config.json` key explained
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md) — research issue sequencing and phases
- [Testing Guide](./TESTING.md) — two-tier test convention, where to put new tests, running tests

## Documentation Structure

### **Features** (`/features/`)
User-facing feature documentation:
- [Monument Photo OCR](./features/monument-photo-ocr.md) - Dual processing modes for record sheets and monument photos
- [Model Selection](./features/model-selection.md) - AI provider selection (OpenAI, Anthropic Claude, Google Gemini, Mistral OCR)
- [Mistral OCR Provider](./features/mistral-ocr-provider.md) - Two-step OCR pipeline using mistral-ocr-latest
- [Tabular Results](./features/tabular-results.md) - Enhanced results display and export functionality
- [Prompt Caching](./features/prompt-caching.md) - Caching optimisations for cost reduction

### **Operations** (`/operations/`)
Deployment and maintenance:
- [Runbook](./operations/RUNBOOK.md) - Deployment, monitoring, and incident response
- [Performance Monitoring](./operations/performance-monitoring.md) - Alert thresholds and log configuration
- [Handover Guide](./operations/handover.md) - Project handover information

### **Implementation** (`/implementation/`)
Technical design and work breakdown structures:
- [Current State Analysis](./implementation/current-state-analysis.md) - Detailed system analysis
- [Monument Photo OCR Phase 0](./implementation/monument-photo-ocr-phase0-wbs.md) - Implementation guide

### **Testing** (`/testing/`)
Test reports and procedures:
- [E2E Test Report](./testing/E2E_TEST_REPORT.md) - Project/Collection model E2E results
- [Testing Issues](./testing/issues.md) - Known testing problems and solutions

### **Troubleshooting** (`/rca/`)
Root cause analysis:
- [Issue #28 - Progress Bar System](./rca/issue-28-progress-bar-system.md) - Progress tracking bug analysis


## Quick Start

1. **New to the codebase?** Start with [Architecture Overview](./ARCHITECTURE.md)
2. **Building against the API?** See [API Reference](./API.md)
3. **Deploying or operating?** See the [Runbook](./operations/RUNBOOK.md)
4. **Configuring?** See [Configuration Reference](./CONFIG.md)
