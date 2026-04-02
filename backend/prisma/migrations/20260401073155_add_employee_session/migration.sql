-- CreateTable
CREATE TABLE "EmployeeSession" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "sessionToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSession_sessionToken_key" ON "EmployeeSession"("sessionToken");

-- CreateIndex
CREATE INDEX "EmployeeSession_sessionToken_idx" ON "EmployeeSession"("sessionToken");

-- AddForeignKey
ALTER TABLE "EmployeeSession" ADD CONSTRAINT "EmployeeSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
