# Receipt OCR Pipeline Strategy

## Overview

Multi-layer fallback pipeline for receipt analysis. Each layer escalates only when the previous layer fails or returns low-confidence results.

## Pipeline Flow

```
Receipt Image
     │
     ▼
┌─────────────────────────┐
│  Layer 1: Self-Hosted   │  EasyOCR sidecar (DO server) or Pi
│  Cost: $0               │  Speed: ~15-25s
│  RAM: ~3.7GB            │  Accuracy: Good (exact on clean receipts)
└───────────┬─────────────┘
            │ Failed / Low confidence
            ▼
┌─────────────────────────┐
│  Layer 2: Azure Vision  │  Azure AI Vision OCR (Read API)
│  Cost: Free (5,000/mo)  │  Speed: 1-3s
│  Free tier: F0          │  Accuracy: Better (~95%)
└───────────┬─────────────┘
            │ Still failed / Unreadable
            ▼
┌─────────────────────────┐
│  Layer 3: Manual Review │  Staff reviews in admin dashboard
│  Cost: $0               │  Status: UNREADABLE
│  Human verification     │  Admin can manually input values
└─────────────────────────┘
```

## Layer Details

### Layer 1 — Self-Hosted OCR (Current)

- **Engine:** EasyOCR 1.7.2 in Docker sidecar container
- **Location:** DO server (or Pi in future)
- **Endpoint:** `POST http://ocr:5000/ocr` (internal Docker network)
- **Pros:** Zero cost, full control, no external dependency
- **Cons:** 3.7GB RAM (needs swap on 1GB droplet), slower
- **Pass criteria:** Amount extracted with confidence, key fields present

### Layer 2 — Azure Vision OCR (Future)

- **Service:** Azure AI Vision — Read API (F0 free tier)
- **Free tier:** 5,000 pages/month, 20 calls/minute
- **Paid (S1):** $1.00 per 1,000 pages (if ever needed)
- **Pros:** Fast (1-3s), no server resources, higher accuracy on degraded images
- **Cons:** External dependency, network latency, free tier limit
- **When triggered:** Layer 1 returns null amount or low overall confidence
- **Integration:** Replace image buffer POST → Azure Read API call, feed text lines into existing `receiptParser.ts`

#### Alternative: Azure Document Intelligence (Receipt Model)

- **Free tier:** 500 pages/month
- **Paid (S0):** $10.00 per 1,000 pages
- **Output:** Structured JSON (merchant, total, tax, date, items) — no regex needed
- **Trade-off:** 10x more expensive than Vision OCR, but returns structured data directly
- **Decision:** Use Vision OCR (5,000 free) unless accuracy proves insufficient, then consider upgrading to Document Intelligence

### Layer 3 — Manual Review (Current)

- **Trigger:** Both OCR layers failed or returned UNREADABLE
- **Status:** `UNREADABLE` in ReceiptAnalysis table
- **UX:** Staff sees flagged receipt in admin dashboard, can manually verify/input values
- **Already implemented:** Admin page shows UNREADABLE status with receipt image

## Escalation Logic (Future Implementation)

```typescript
async function analyzeReceipt(paymentId: string) {
  // Layer 1: Self-hosted EasyOCR
  const localResult = await tryLocalOcr(imageBuffer);
  if (localResult && localResult.amount !== null) {
    return saveResult(paymentId, localResult); // MATCHED or MISMATCH
  }

  // Layer 2: Azure Vision OCR
  const azureResult = await tryAzureVisionOcr(imageBuffer);
  if (azureResult && azureResult.amount !== null) {
    return saveResult(paymentId, azureResult, { source: 'azure' });
  }

  // Layer 3: Manual review
  return saveUnreadable(paymentId);
}
```

## Cost Projection

| Monthly Receipts | Layer 1 (Self-Hosted) | Layer 2 (Azure Vision F0) | Total Cost |
|------------------|-----------------------|---------------------------|------------|
| 50               | $0                    | $0 (within 5,000 free)    | **$0**     |
| 200              | $0                    | $0 (within 5,000 free)    | **$0**     |
| 500              | $0                    | $0 (within 5,000 free)    | **$0**     |
| 5,000+           | $0                    | $1/1,000 overage          | **~$0-5**  |

> At typical K GOLF volumes (<200 receipts/month), the entire pipeline is free.

## Implementation Status

- [x] Layer 1: EasyOCR sidecar — implemented, tested
- [x] Layer 3: Manual review (UNREADABLE status) — implemented in admin dashboard
- [ ] Layer 2: Azure Vision OCR — future work
- [ ] Escalation logic between layers — future work
- [ ] Confidence scoring to trigger escalation — future work

## Setup Notes (When Implementing Layer 2)

1. Create Azure AI Vision resource (F0 free tier)
2. Add env vars: `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY`
3. Install SDK: `npm install @azure/cognitiveservices-computervision @azure/ms-rest-js`
4. Create `azureOcrService.ts` — call Read API, return `OcrTextLine[]`
5. Wire into `receiptAnalyzer.ts` as fallback after local OCR
