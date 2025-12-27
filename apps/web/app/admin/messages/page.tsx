import { AdminTabs } from "@/components/admin/AdminTabs";
import { EnquiriesTab } from "@/components/admin/messages/enquiries-tab";
import { BroadcastsTab } from "@/components/admin/messages/broadcasts-tab";
import { listRecentClients, loadConversation, sendToClient } from "@/server/messages/actions"
import InboxClient from "@/components/admin/messages/inbox-tab";

const MESSAGE_TABS = [
  { value: "inbox", label: "Inbox" },
  { value: "enquiries", label: "Enquiries" },
  { value: "broadcasts", label: "Broadcasts" },
  { value: "marketting", label: "Marketting" }
] as const;

type MessagesPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function resolveTab(
  value: string | string[] | undefined,
  fallback: (typeof MESSAGE_TABS)[number]["value"],
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return MESSAGE_TABS.some((tab) => tab.value === candidate) ? candidate : fallback;
}

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const params = searchParams ?? {};
  const currentTab = resolveTab(params.tab, "inbox");

  const initialClients = await listRecentClients();
  const firstClientId = initialClients[0]?.clientId ?? null;
  const initialConversation = firstClientId ? await loadConversation(firstClientId) : [];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto w-full flex gap-4">

      <AdminTabs
        defaultTab="inbox"
        tabs={MESSAGE_TABS.map(({ value, label }) => ({ value, label }))}
        hrefBase="/admin/messages"
        className="max-w-36 mx-auto w-full"
      />

      <div className="space-y-6 flex-1
      ">
        {currentTab === "inbox" && (
            <InboxClient
              initialClients={initialClients}
              initialConversation={initialConversation}
              sendAction={sendToClient}
              loadConversationAction={loadConversation}
              listClientsAction={listRecentClients}
            />
        )}
        {currentTab === "enquiries" && (
            <EnquiriesTab />
        )}
        {currentTab === "broadcasts" && (
            <BroadcastsTab />
        )}
      </div>
    </div>
  );
}
