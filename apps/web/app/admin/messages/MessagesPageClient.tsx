"use client";

import * as React from "react";
import type { InboxConversation } from "@/server/messages/actions";
import type { Family, Level, InvoiceStatus } from "@prisma/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InboxTab } from "./InboxTab";
import { ComposeTab } from "./ComposeTab";

type Props = {
  conversations: InboxConversation[];
  families: Family[];
  levels: Level[];
  invoiceStatuses: InvoiceStatus[];
};

export default function MessagesPageClient({ conversations, families, levels, invoiceStatuses }: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-card px-4 py-3">
        <div className="text-base font-semibold">Messages</div>
        <div className="text-xs text-muted-foreground">SMS and email messaging for admins.</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <Tabs defaultValue="inbox" className="flex h-full flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="compose">Compose</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4 flex-1">
            <InboxTab conversations={conversations} families={families} />
          </TabsContent>

          <TabsContent value="compose" className="mt-4 flex-1 overflow-y-auto">
            <ComposeTab families={families} levels={levels} invoiceStatuses={invoiceStatuses} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
