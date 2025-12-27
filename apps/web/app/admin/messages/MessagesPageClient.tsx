"use client";

import * as React from "react";
import type { InboxConversation } from "@/server/messages/actions";
import type { Family, Level, InvoiceStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { InboxTab } from "./InboxTab";
import { ComposeTab } from "./ComposeTab";

type Props = {
  conversations: InboxConversation[];
  families: Family[];
  levels: Level[];
  invoiceStatuses: InvoiceStatus[];
};

function ComposeSheet({
  families,
  levels,
  invoiceStatuses,
}: {
  families: Family[];
  levels: Level[];
  invoiceStatuses: InvoiceStatus[];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>New message</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New message</SheetTitle>
          <SheetDescription>Send an SMS or Email to a family, or broadcast to groups.</SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {/* Keep your existing ComposeTab UI intact */}
          <ComposeTab families={families} levels={levels} invoiceStatuses={invoiceStatuses} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BroadcastSheet({
  families,
  levels,
  invoiceStatuses,
}: {
  families: Family[];
  levels: Level[];
  invoiceStatuses: InvoiceStatus[];
}) {
  // OPTIONAL: If you want a tighter UI, you can later split ComposeTab into Direct/Broadcast panels.
  // For now we just open the same ComposeTab; you can scroll to the broadcast section.
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Broadcast</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Broadcast</SheetTitle>
          <SheetDescription>Send one message to many families using filters.</SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <ComposeTab families={families} levels={levels} invoiceStatuses={invoiceStatuses} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function MessagesPageClient({
  conversations,
  families,
  levels,
  invoiceStatuses,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b bg-card px-4 py-3">
        <div>
          <div className="text-base font-semibold">Messages</div>
          <div className="text-xs text-muted-foreground">Inbox + SMS/Email sending for admins.</div>
        </div>

        <div className="flex gap-2">
          <BroadcastSheet families={families} levels={levels} invoiceStatuses={invoiceStatuses} />
          <ComposeSheet families={families} levels={levels} invoiceStatuses={invoiceStatuses} />
        </div>
      </div>

      {/* Content (no nested page scroll) */}
      <div className="flex-1 overflow-hidden">
        <InboxTab conversations={conversations} families={families} />
      </div>
    </div>
  );
}
