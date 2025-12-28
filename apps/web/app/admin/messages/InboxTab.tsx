"use client";

import * as React from "react";
import type { InboxConversation, ConversationMessage } from "@/server/messages/actions";
import { loadConversation, sendToConversation, linkConversationToFamily } from "@/server/messages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Family } from "@prisma/client";

type InboxTabProps = {
  conversations: InboxConversation[];
  families: Family[];
};

export function InboxTab({ conversations, families }: InboxTabProps) {
  const [query, setQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(conversations[0]?.id ?? null);
  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [reply, setReply] = React.useState("");
  const [loading, startLoading] = React.useTransition();
  const [sending, startSend] = React.useTransition();
  const [linking, startLink] = React.useTransition();
  const [selectedFamily, setSelectedFamily] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.phoneNumber.includes(q) || c.family?.name?.toLowerCase().includes(q));
  }, [conversations, query]);

  React.useEffect(() => {
    if (!activeId) return;
    startLoading(async () => {
      const data = await loadConversation(activeId);
      setMessages(data);
    });
  }, [activeId]);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const handleSend = () => {
    if (!activeId) return;
    startSend(async () => {
      setError(null);
      const res = await sendToConversation({ conversationId: activeId, body: reply });
      if (!res.ok) {
        setError(res.error ?? "Failed to send");
      } else {
        const updated = await loadConversation(activeId);
        setMessages(updated);
        setReply("");
      }
    });
  };

  const handleLink = () => {
    if (!activeId || !selectedFamily) return;
    startLink(async () => {
      await linkConversationToFamily(activeId, selectedFamily);
    });
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[320px,1fr]">
      <div className="flex h-full flex-col rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b p-3">
          <Input
            placeholder="Search conversations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((conv) => (
            <button
              key={conv.id}
              className={cn(
                "w-full border-b px-3 py-3 text-left hover:bg-accent/40",
                conv.id === activeId ? "bg-accent" : ""
              )}
              onClick={() => setActiveId(conv.id)}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {conv.family?.name ?? "Unmatched"}{" "}
                  <span className="text-xs text-muted-foreground">{conv.phoneNumber}</span>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {conv.lastStatus}
                </Badge>
              </div>
              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{conv.lastBody}</div>
              <div className="text-[11px] text-muted-foreground">
                {format(new Date(conv.lastAt), "MMM d, h:mm a")}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No conversations found.</div>
          )}
        </div>
      </div>

      <div className="flex h-full flex-col rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <div className="text-sm font-semibold">
              {activeConversation?.family?.name ?? "Unmatched"} ({activeConversation?.phoneNumber ?? "—"})
            </div>
            <div className="text-xs text-muted-foreground">Messages are shown oldest to newest.</div>
          </div>
          {!activeConversation?.family && (
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border px-2 text-sm"
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
              >
                <option value="">Link to family…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" disabled={!selectedFamily || linking} onClick={handleLink}>
                Link
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading && <div className="text-sm text-muted-foreground">Loading conversation…</div>}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-xl rounded-lg border p-3",
                m.direction === "OUTBOUND" ? "ml-auto bg-accent/40" : "mr-auto bg-muted"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">{m.direction === "OUTBOUND" ? "You" : "Family"}</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {m.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">{format(new Date(m.createdAt), "MMM d, h:mm a")}</span>
                </div>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm">{m.body}</div>
              {m.errorMessage && (
                <div className="mt-1 text-xs text-destructive">Error: {m.errorMessage}</div>
              )}
            </div>
          ))}

          {!loading && messages.length === 0 && (
            <div className="text-sm text-muted-foreground">No messages yet.</div>
          )}
        </div>

        <div className="border-t p-4">
          {error && <div className="mb-2 text-sm text-destructive">{error}</div>}
          <Textarea
            placeholder="Type a reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="mb-2"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{reply.length} characters</span>
            <Button onClick={handleSend} disabled={sending || !reply.trim() || !activeId}>
              {sending ? "Sending…" : "Send SMS"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
