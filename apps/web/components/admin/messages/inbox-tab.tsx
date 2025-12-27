"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, Clock, Loader2, Send, X, Search } from "lucide-react";
import type { SAClientItem, SAMessage } from "@/server/messages/actions";
import { getSupaBrowser } from "@/lib/realtime/supabase-browser";

type SearchResult = { id: string; name: string | null; email: string | null; phone: string | null };

export default function InboxClient({
  initialClients,
  initialConversation,
  sendAction,
  loadConversationAction,
  listClientsAction,
}: {
  initialClients: SAClientItem[];
  initialConversation: SAMessage[];
  sendAction: (
    input: { clientId: string; to: string; body: string }
  ) => Promise<{ ok: true; id: string } | { ok: false; error?: string }>;
  loadConversationAction: (clientId: string) => Promise<SAMessage[]>;
  listClientsAction: () => Promise<SAClientItem[]>;
}) {
  const [clients, setClients] = useState(initialClients);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    initialClients[0]?.clientId ?? null
  );
  const [conversation, setConversation] = useState<SAMessage[]>(initialConversation);

  // ---- search state ----
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchAbort = useRef<AbortController | null>(null);

  const selectedClient =
    useMemo(() => clients.find((c) => c.clientId === selectedClientId) || null, [
      clients,
      selectedClientId,
    ]);

  // Load conversation on selection
  useEffect(() => {
    if (!selectedClientId) return;
    loadConversationAction(selectedClientId).then(setConversation).catch(console.error);
  }, [selectedClientId, loadConversationAction]);

  // Soft polling every 10s
  useEffect(() => {
    const t = setInterval(() => {
      listClientsAction().then(setClients).catch(() => {});
      if (selectedClientId)
        loadConversationAction(selectedClientId).then(setConversation).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [selectedClientId, listClientsAction, loadConversationAction]);

  // A) Inbox (left list) realtime
useEffect(() => {
  const supa = getSupaBrowser();
  const inbox = supa
    .channel("inbox-updates")
    .on("broadcast", { event: "inbox:updated" }, async () => {
      try {
        const list = await listClientsAction();
        setClients(list);
      } catch {}
    })
    .subscribe();

  return () => {
    supa.removeChannel(inbox);
  };
}, [listClientsAction]);

// B) Per-conversation realtime
useEffect(() => {
  if (!selectedClientId) return;
  const supa = getSupaBrowser();
  const channelName = `convo-${selectedClientId}`;

  const convo = supa
    .channel(channelName)
    .on("broadcast", { event: "message:new" }, (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m: any = ev.payload;
      setConversation(prev =>
        prev.some(x => x.id === m.id)
          ? prev
          : [...prev, { ...m, createdAt: new Date(m.createdAt).toISOString() }]
      );
    })
    .on("broadcast", { event: "message:update" }, async () => {
      try {
        const conv = await loadConversationAction(selectedClientId);
        setConversation(conv);
      } catch {}
    })
    .subscribe();

  return () => {
    supa.removeChannel(convo);
  };
}, [selectedClientId, loadConversationAction]);

  // Debounced search
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    if (searchAbort.current) searchAbort.current.abort();
    const controller = new AbortController();
    searchAbort.current = controller;

    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/search/clients?q=${encodeURIComponent(q.trim())}&limit=8`,
          { signal: controller.signal }
        );
        const data = (await r.json()) as { clients: SearchResult[] };
        setResults(data.clients ?? []);
      } catch (e) {
        if (!controller.signal.aborted) setResults([]);
        console.error(e);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  // Start conversation with a searched client (not in recent list yet)
  const startConversation = useCallback(
    async (client: SearchResult) => {
      if (!client.id) return;
      // If not in recent list, add a placeholder entry so it appears and can be selected
      const exists = clients.some((c) => c.clientId === client.id);
      if (!exists) {
        const placeholder: SAClientItem = {
          clientId: client.id,
          lastBody: "",
          lastDirection: "OUTBOUND",
          lastStatus: "SENT",
          lastAt: new Date().toISOString(),
          client: { id: client.id, name: client.name, phone: client.phone },
        };
        setClients((prev) => [placeholder, ...prev]);
      }
      setSelectedClientId(client.id);
      // Load empty (or existing) conversation
      const thread = await loadConversationAction(client.id);
      setConversation(thread);
      // Clear search UI
      setQ("");
      setResults([]);
    },
    [clients, loadConversationAction]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mx-auto w-full max-w-7xl">
      {/* Left: recent clients + search */}
      <Card className="md:col-span-5 lg:col-span-4">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Inbox</CardTitle>

          {/* Search + filter row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search clients by name, email, phone…"
                className="pl-8"
              />
              {/* Search results panel */}
              {!!q.trim() && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow">
                  <div className="max-h-64 overflow-auto">
                    {searching && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
                    )}
                    {!searching && results.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No matches
                      </div>
                    )}
                    {!searching &&
                      results.map((r) => (
                        <div
                          key={r.id}
                          className="px-3 py-2 flex items-center justify-between hover:bg-accent cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {r.name || r.phone || r.email || "Unknown"}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {[r.phone, r.email].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              startConversation(r);
                            }}
                          >
                            Start
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[60vh]">
            <ul className="divide-y">
              {clients.map((c) => (
                <li key={c.clientId}>
                  <button
                    onClick={() => setSelectedClientId(c.clientId)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-accent/50 transition",
                      selectedClientId === c.clientId && "bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {(c.client?.name || c.client?.phone || "?")
                            .replace(/\+/g, "")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate font-medium">
                            {c.client?.name || c.client?.phone || "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(c.lastAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                          {c.lastDirection === "OUTBOUND" && <StatusIcon status={c.lastStatus} />}
                          <span className="truncate">{c.lastBody || "—"}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
              {clients.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">No conversations.</li>
              )}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Middle: conversation */}
      <Card className="md:col-span-7 lg:col-span-8 flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {selectedClient ? selectedClient.client?.name || selectedClient.client?.phone : "Conversation"}
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              {selectedClient?.client?.phone}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 flex flex-col max-h-[62vh] h-full">
          <ScrollArea className="flex-1 h-full">
            <div className="p-4 space-y-3">
              {conversation.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {conversation.length === 0 && (
                <div className="text-sm text-muted-foreground">No messages yet.</div>
              )}
            </div>
          </ScrollArea>
          <Composer
            disabled={!selectedClient}
            clientId={selectedClient?.clientId || ""}
            to={selectedClient?.client?.phone || ""}
            onSend={async (payload) => {
              await sendAction(payload);
              const [list, conv] = await Promise.all([
                listClientsAction(),
                loadConversationAction(payload.clientId),
              ]);
              setClients(list);
              setConversation(conv);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusIcon({ status }: { status: SAMessage["status"] }) {
  if (status === "DELIVERED") return <CheckCheck className="h-4 w-4" />;
  if (status === "SENT") return <Check className="h-4 w-4" />;
  if (status === "FAILED") return <X className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />; // PENDING
}

function MessageBubble({ message }: { message: SAMessage }) {
  const mine = message.direction === "OUTBOUND";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          mine ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-[10px] opacity-80",
            mine ? "justify-end" : "justify-start"
          )}
        >
          <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

function Composer({
  clientId,
  to,
  onSend,
  disabled,
}: {
  clientId: string;
  to: string;
  onSend: (p: { clientId: string; to: string; body: string }) => Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(async () => {
    if (!text.trim() || !to || !clientId) return;
    setPending(true);
    try {
      await onSend({ clientId, to, body: text.trim() });
      setText("");
      ref.current?.focus();
    } finally {
      setPending(false);
    }
  }, [text, to, clientId, onSend]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="border-t p-3 flex items-end gap-2">
      <Textarea
        ref={ref}
        disabled={disabled || pending}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={disabled ? "Select a conversation" : "Type a message…"}
        className="min-h-[44px] h-[44px] max-h-40 resize-y"
      />
      <Button onClick={() => void send()} disabled={disabled || pending || !text.trim()}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        <span className="sr-only">Send</span>
      </Button>
    </div>
  );
}
