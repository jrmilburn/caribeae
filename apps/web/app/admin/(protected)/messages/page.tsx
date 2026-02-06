import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { listInboxConversations } from "@/server/messages/actions";
import { getFamilies } from "@/server/family/getFamilies";
import { getLevels } from "@/server/level/getLevels";
import { getClassFilterOptions } from "@/server/communication/getClassFilterOptions";
import MessagesPageClient from "./MessagesPageClient";
import { InvoiceStatus } from "@prisma/client";

export default async function MessagesPage() {
  await getOrCreateUser();
  await requireAdmin();

  const [conversations, families, levels, classOptions] = await Promise.all([
    listInboxConversations(),
    getFamilies(),
    getLevels(),
    getClassFilterOptions(),
  ]);

  return (
    <div className="h-full max-h-full overflow-hidden">
      <MessagesPageClient
        conversations={conversations}
        families={families}
        levels={levels}
        classOptions={classOptions}
        invoiceStatuses={Object.values(InvoiceStatus)}
      />
    </div>
  );
}
