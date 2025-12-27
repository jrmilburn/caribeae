-- Create enums
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'EMAIL');

-- Conversation table to group threads by phone number
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "familyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_phoneNumber_key" ON "Conversation"("phoneNumber");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Message table changes
ALTER TABLE "Message" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'SMS';
ALTER TABLE "Message" ADD COLUMN     "subject" TEXT;
ALTER TABLE "Message" ADD COLUMN     "fromEmail" TEXT;
ALTER TABLE "Message" ADD COLUMN     "toEmail" TEXT;
ALTER TABLE "Message" ADD COLUMN     "conversationId" TEXT;
ALTER TABLE "Message" ADD COLUMN     "familyId" TEXT;

ALTER TABLE "Message" ALTER COLUMN "fromNumber" DROP NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "toNumber" DROP NOT NULL;

-- Drop client linkage if it exists (deprecated)
ALTER TABLE "Message" DROP COLUMN IF EXISTS "clientId";
DROP INDEX IF EXISTS "Message_clientId_createdAt_idx";

-- New indexes and FKs
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_familyId_createdAt_idx" ON "Message"("familyId", "createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;
