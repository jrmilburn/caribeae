import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { listInboxConversations } from "@/server/messages/actions";
import { getFamilies } from "@/server/family/getFamilies";
import { getLevels } from "@/server/level/getLevels";
import MessagesPageClient from "./MessagesPageClient";
import { InvoiceStatus } from "@prisma/client";

export default async function MessagesPage() {
  await getOrCreateUser();
  await requireAdmin();

  const [conversations, families, levels] = await Promise.all([
    listInboxConversations(),
    getFamilies(),
    getLevels(),
  ]);

  return (
    <div className="h-full max-h-full overflow-hidden">
      <MessagesPageClient
        conversations={conversations}
        families={families}
        levels={levels}
        invoiceStatuses={Object.values(InvoiceStatus)}
      />
    </div>
  );
}
