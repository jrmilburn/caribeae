-- CreateTable
CREATE TABLE "AccountOpeningState" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "batchId" TEXT,
    "openingBalanceCents" INTEGER NOT NULL,

    CONSTRAINT "AccountOpeningState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountOpeningState_familyId_key" ON "AccountOpeningState"("familyId");

-- AddForeignKey
ALTER TABLE "AccountOpeningState" ADD CONSTRAINT "AccountOpeningState_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpeningState" ADD CONSTRAINT "AccountOpeningState_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
