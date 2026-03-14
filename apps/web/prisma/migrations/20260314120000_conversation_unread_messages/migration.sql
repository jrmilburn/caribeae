ALTER TABLE "Conversation"
ADD COLUMN "hasUnreadMessages" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Conversation" AS conversation
SET "hasUnreadMessages" = true
FROM (
  SELECT DISTINCT ON ("conversationId")
    "conversationId",
    "direction"
  FROM "Message"
  WHERE "conversationId" IS NOT NULL
  ORDER BY "conversationId", "createdAt" DESC, "id" DESC
) AS latest
WHERE conversation."id" = latest."conversationId"
  AND latest."direction" = 'INBOUND';
