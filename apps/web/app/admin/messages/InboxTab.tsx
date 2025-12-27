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
    return conversations.filter((c) => {
      const familyName = c.family?.name?.toLowerCase() ?? "";
      return c.phoneNumber.toLowerCase().includes(q) || familyName.includes(q);
    });
  }, [conversations, query]);

  // Keep active conversation valid when filters/data change
  React.useEffect(() => {
    if (!filtered.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !filtered.some((c) => c.id === activeId)) {
      setActiveId(filtered[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, conversations]);

  const activeConversation = React.useMemo(
    () => (activeId ? conversations.find((c) => c.id === activeId) : undefined),
    [activeId, conversations]
  );

  // Load thread when active changes
  React.useEffect(() => {
    if (!activeId) return;
    startLoading(async () => {
      try {
        const data = await loadConversation(activeId);
        setMessages(data);
      } catch (e) {
        // Silent fail; you can add toast if you want
        setMessages([]);
      }
    });
  }, [activeId]);

  const handleSend = () => {
    if (!activeId) return;
    const body = reply.trim();
    if (!body) return;

    startSend(async () => {
      setError(null);

      // optimistic append (optional but makes UI feel snappy)
      const optimisticId = `optimistic_${Date.now()}`;
      const optimistic: ConversationMessage = {
        id: optimisticId,
        body,
        direction: "OUTBOUND",
        status: "QUEUED" as any,
        createdAt: new Date(),
        errorMessage: null,
      };

      setMessages((prev) => [...prev, optimistic]);
      setReply("");

      const res = await sendToConversation({ conversationId: activeId, body });
      if (!res.ok) {
        setError(res.error ?? "Failed to send");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, status: "FAILED", errorMessage: res.error ?? "Failed to send" }
              : m
          )
        );
        return;
      }

      // Refresh to get real provider status + message id
      const updated = await loadConversation(activeId);
      setMessages(updated);
    });
  };

  const handleLink = () => {
    if (!activeId || !selectedFamily) return;
    startLink(async () => {
      await linkConversationToFamily(activeId, selectedFamily);
      // you can also refresh list upstream later; but this keeps it drop-in
      setSelectedFamily("");
    });
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[380px_1fr]">
      {/* LEFT: Conversation list */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden border bg-card border-r-0! border-l-0! border-t-0!">
        <div className="sticky top-0 z-10 border-b bg-card p-3">
          <Input
            placeholder="Search families or numbers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
          <div className="mt-2 text-[11px] text-muted-foreground">
            {filtered.length} conversation{filtered.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.map((conv) => {
            const isActive = conv.id === activeId;
            return (
              <button
                key={conv.id}
                className={cn(
                  "w-full border-b px-3 py-3 text-left transition-colors hover:bg-accent/40",
                  isActive ? "bg-accent" : ""
                )}
                onClick={() => setActiveId(conv.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {conv.family?.name ?? "Unknown number"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{conv.phoneNumber}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-muted-foreground">
                    {format(new Date(conv.lastAt), "MMM d, h:mm a")}
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="line-clamp-1 text-xs text-muted-foreground">{conv.lastBody}</div>
                  {conv.lastStatus ? (
                    <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                      {conv.lastStatus}
                    </Badge>
                  ) : null}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No conversations found.</div>
          )}
        </div>
      </div>

      {/* RIGHT: Thread */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden border bg-card border-t-0!">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {activeConversation?.family?.name ?? "Select a conversation"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {activeConversation?.phoneNumber ?? "—"}
            </div>
          </div>

          {/* Link UI when unknown */}
          {activeConversation && !activeConversation.family && (
            <div className="flex items-center gap-2">
              <select
                className="h-9 max-w-[220px] rounded-md border bg-background px-2 text-sm"
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
                {linking ? "Linking…" : "Link"}
              </Button>
            </div>
          )}
        </div>

        {/* Thread body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!activeConversation ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Choose a conversation to view messages.
            </div>
          ) : loading ? (
            <div className="text-sm text-muted-foreground">Loading conversation…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">No messages yet.</div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              {messages.map((m) => {
                const outbound = m.direction === "OUTBOUND";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-2xl border px-3 py-2",
                      outbound ? "ml-auto bg-accent/40" : "mr-auto bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium">{outbound ? "You" : "Family"}</div>
                      <div className="flex items-center gap-2">
                        {m.status ? (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {m.status}
                          </Badge>
                        ) : null}
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(m.createdAt), "MMM d, h:mm a")}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 whitespace-pre-wrap text-sm">{m.body}</div>

                    {m.errorMessage ? (
                      <div className="mt-1 text-xs text-destructive">Error: {m.errorMessage}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t p-4">
          {error ? <div className="mb-2 text-sm text-destructive">{error}</div> : null}

          <Textarea
            placeholder={activeConversation ? "Write a reply…" : "Select a conversation to reply…"}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="mb-2"
            rows={3}
            disabled={!activeConversation}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{reply.length} characters</span>
            <Button
              onClick={handleSend}
              disabled={!activeConversation || sending || !reply.trim()}
            >
              {sending ? "Sending…" : "Send SMS"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
