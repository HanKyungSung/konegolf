# Receipt OCR Investigation Report

> **Date:** April 15, 2026
> **Goal:** Automatically verify uploaded card receipt images match payment records
> **Test Receipt:** K GOLF, $121.98, Mastercard ****6058, 04/08/26

## Problem Statement

Staff upload card/gift card receipt photos after processing payments. We need to automatically extract key fields (amount, card last 4, card type, date) from receipt images and compare them against database payment records to flag mismatches.

## Infrastructure

| Resource | Specs | Available RAM |
|----------|-------|---------------|
| **DO Server** (production) | 1 vCPU, 969MB RAM, 25GB disk | ~449MB |
| **Pi5** (han-pi5) | 4x A76 @ 2.4GHz, 8GB RAM, Hailo-8 26 TOPS | ~7.3GB |

- DO Server runs the main app (Express + PostgreSQL in Docker)
- Pi5 connected via Tailscale (100.83.253.110) and LAN (han-pi5.local)

## Tools Tested

### 1. Ollama gemma4:e2b (Vision LLM on Pi)

- **How:** Send receipt image + structured prompt to Ollama vision API
- **Result:** ❌ **Vision encoder too weak for OCR**
  - Amount: $12.98 (actual $121.98) — scrambles digit positions
  - Card last 4: null — can't read at all
  - Card type: null in thinking, Mastercard in some runs
  - Speed: 3.5 min per image (CPU inference)
  - RAM: 7.2 GB
- **Root Cause:** gemma4:e2b's vision encoder garbles text from images. The LLM reasoning is fine, but the image-to-text translation is broken. Thinking logs showed it reads "UNIT: 12.98" instead of "AMOUNT $121.98".

### 2. Tesseract 5.5.0 (Traditional OCR on Pi)

Tested 12 preprocessing combinations. Best results:

| Preprocessing | Amount | Card Last4 | Speed | RAM |
|--------------|--------|-----------|-------|-----|
| RAW (no preprocess) | $121. ⚠️ no cents | `*****B 058` ⚠️ | 0.9s | 108MB |
| **2x Upscale + Sharpen** | **$121.99** ⚠️ ($0.01 off) | not extracted | 1.2s | 108MB |
| 2x + OEM1 (LSTM only) | $121.99 ⚠️ | not extracted | 1.2s | 108MB |
| 4x Upscale + Sharpen | $121.93 ⚠️ ($0.05 off) | not extracted | 3.3s | 108MB |
| Grayscale + Threshold | $121. ⚠️ | - | 0.6s | 108MB |
| High Contrast + Thresh | $121. ⚠️ | - | 0.7s | 108MB |
| 3x + Sharp + Thresh | no amount | - | 1.0s | 108MB |

**Verdict:** Best case is $0.01 off (within ±$0.02 tolerance), but card last 4 unreliable. Consistently struggles with exact cents on thermal receipts.

### 3. EasyOCR 1.7.2 (Neural Network OCR on Pi)

| Field | Extracted | Confidence | Correct? |
|-------|-----------|------------|----------|
| Amount | $121.98 | 0.67 | ✅ Exact |
| Card Last 4 | 6058 | 1.00 | ✅ |
| Card Type | MASTERCARD | 1.00 | ✅ |
| Date | 04/08/26 | 0.82 | ✅ |
| Approval Code | 06834E | 0.84 | ✅ |
| MID | 6891356 | 0.93 | ✅ |
| TID | 001 | 0.94 | ✅ |

- **Speed:** ~25s per image (consistent across 3 runs, warm)
- **Init:** 6.8s one-time (import 2.7s + model load 4.1s)
- **RAM:** 3,745 MB peak (3.7 GB)
- **Text regions detected:** 54

### 4. PaddleOCR 3.4.1 (Pi)

- **Result:** ❌ **Segfaults on ARM64**
- PaddlePaddle 3.2.2 installs fine (Python layer), but C++ inference engine crashes with SIGSEGV when loading models
- Known ARM64/aarch64 compatibility issue with prebuilt wheels
- Would need building from source — very high effort

## Final Comparison

| Tool | Amount | Card# | Speed | RAM | Server? | Pi? |
|------|--------|-------|-------|-----|---------|-----|
| **EasyOCR** | ✅ $121.98 | ✅ 6058 | 25s | 3.7GB | ❌ OOM | ✅ |
| Tesseract (2x+Sharp) | ⚠️ $121.99 | ⚠️ partial | 1.2s | 108MB | ✅ fits | ✅ |
| Ollama gemma4 | ❌ $12.98 | ❌ null | 3.5min | 7.2GB | ❌ | ⚠️ |
| PaddleOCR | ❌ segfault | — | — | — | ? | ❌ |
| Cloud API (est.) | ✅ exact | ✅ | 1-2s | ~0MB | ✅ | n/a |

## Decision

**EasyOCR on Pi5** — best accuracy (6/6 fields correct), acceptable speed for fire-and-forget async analysis, and Pi has plenty of RAM (8GB).

### Why not server-side Tesseract?
- Amount off by $0.01-$0.05 depending on preprocessing
- Card last 4 unreliable (partial reads)
- While $0.01 is within ±$0.02 tolerance, this varies by receipt quality

### Why not Cloud API?
- Adds external dependency and API key management
- Free tier limits (Google Vision: 1000/month)
- Overkill for current receipt volume

## Future Upgrade Path

### Hailo-8 Acceleration (Pi has 26 TOPS chip installed)

The Pi5 has a Hailo-8 AI HAT+ detected on PCIe (`/dev/hailo0`), but the SDK is not installed.

**Option A: Hailo PaddleOCR (pre-built HEFs)**
- Hailo Model Zoo has `ocr_det.hef` + `ocr.hef` for PaddleOCR v5
- Both detection AND recognition on Hailo chip
- Expected: <2s total, ~200MB RAM
- Effort: Install HailoRT SDK, download HEF models, write Python wrapper

**Option B: Hailo + EasyOCR Hybrid**
- Replace EasyOCR's CRAFT text detection with Hailo-accelerated inference
- Detection from ~20s → <1s, recognition stays on CPU (~5s)
- Expected: 5-8s total, ~1GB RAM
- Effort: Export CRAFT to ONNX → compile to HEF

**Option C: Move to DO Server (if upgraded)**
- Upgrading DO droplet to 4GB RAM ($24/mo) would allow EasyOCR on server
- Eliminates Pi network dependency
- Simpler architecture

## Implementation Plan

### Architecture

```
[POS Frontend] → upload receipt image → [DO Backend]
                                            ↓ (fire-and-forget)
                                        Download image from GDrive
                                            ↓
                                        POST /ocr to Pi Flask service
                                            ↓
                                [Pi5: EasyOCR Flask Service (port 5000)]
                                            ↓
                                        Raw OCR text lines
                                            ↓
                                [DO Backend: regex parser]
                                            ↓
                                        Extract fields & compare with DB
                                            ↓
                                        Save ReceiptAnalysis record
```

### Components

1. **Pi: EasyOCR Flask Service** (`/home/tjdgksrud/ocr-service/`)
   - Python Flask app, port 5000
   - POST `/ocr` — accepts image, returns text lines with confidence
   - GET `/health` — returns model loaded status, memory, uptime
   - Managed by systemd (`ocr-service.service`)
   - Persistent process (EasyOCR reader stays loaded, avoids 6.8s init per request)

2. **Backend: Receipt Parser** (`receiptParser.ts`)
   - Regex patterns for amount, card last 4, card type, date, approval code
   - Takes raw OCR text lines, returns structured fields
   - Pure functions, easily testable

3. **Backend: Receipt Analyzer** (`receiptAnalyzer.ts` — update existing)
   - Replace Ollama API call with HTTP POST to Pi OCR service
   - Pipeline: download image → send to Pi → parse response → compare → save

4. **Environment Variables**
   - `OCR_SERVICE_URL=http://100.83.253.110:5000` (production, Tailscale)
   - `OCR_SERVICE_URL=http://localhost:5000` (dev, SSH tunnel)

### Monitoring

- Admin dashboard already shows ANALYZING status with blue pulsing badge
- `/health` endpoint on Pi reports model loaded, memory, uptime
- Backend logs OCR timing and results
