-- CreateTable
CREATE TABLE "ReceiptAnalysis" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "extractedAmount" DECIMAL(10,2),
    "cardLast4" TEXT,
    "cardType" TEXT,
    "transactionDate" TEXT,
    "transactionTime" TEXT,
    "terminalId" TEXT,
    "approvalCode" TEXT,
    "rawResponse" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "mismatchReason" TEXT,
    "analyzedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelUsed" TEXT,

    CONSTRAINT "ReceiptAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptAnalysis_paymentId_key" ON "ReceiptAnalysis"("paymentId");

-- CreateIndex
CREATE INDEX "ReceiptAnalysis_matchStatus_idx" ON "ReceiptAnalysis"("matchStatus");

-- CreateIndex
CREATE INDEX "ReceiptAnalysis_analyzedAt_idx" ON "ReceiptAnalysis"("analyzedAt");

-- AddForeignKey
ALTER TABLE "ReceiptAnalysis" ADD CONSTRAINT "ReceiptAnalysis_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
