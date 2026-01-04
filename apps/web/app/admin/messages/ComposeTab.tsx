"use client";

import * as React from "react";
import type { Family, Level, InvoiceStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailBuilder, type EmailBuilderHandle } from "@/components/ui/email-builder";
import { cn } from "@/lib/utils";

import {
  previewBroadcastRecipientsAction,
  sendBroadcastAction,
  sendDirectMessageAction,
} from "@/server/messages/workflows";

type ComposeTabProps = {
  families: Family[];
  levels: Level[];
  invoiceStatuses: InvoiceStatus[];
  mode?: "direct" | "broadcast"; // NEW
  onChannelChange?: (channel: Channel) => void;
};

export type Channel = "SMS" | "EMAIL";

export function ComposeTab({ families, levels, invoiceStatuses, mode, onChannelChange }: ComposeTabProps) {
  const showTabs = !mode;
  const defaultValue = mode ?? "direct";

  // ----- Direct -----
  const [familyId, setFamilyId] = React.useState("");
  const [channel, setChannel] = React.useState<Channel>("SMS");
  const [subject, setSubject] = React.useState("");
  const [directSmsMessage, setDirectSmsMessage] = React.useState("");
  const [directEmailReady, setDirectEmailReady] = React.useState(false);
  const directEmailEditorRef = React.useRef<EmailBuilderHandle>(null);
  const [directStatus, setDirectStatus] = React.useState<string | null>(null);
  const [directBusy, startDirect] = React.useTransition();

  // ----- Broadcast -----
  const [broadcastChannel, setBroadcastChannel] = React.useState<Channel>("SMS");
  const [broadcastSmsMessage, setBroadcastSmsMessage] = React.useState("");
  const [broadcastEmailReady, setBroadcastEmailReady] = React.useState(false);
  const broadcastEmailEditorRef = React.useRef<EmailBuilderHandle>(null);
  const [broadcastSubject, setBroadcastSubject] = React.useState("");
  const [selectedLevels, setSelectedLevels] = React.useState<Set<string>>(new Set());
  const [selectedInvoiceStatuses, setSelectedInvoiceStatuses] = React.useState<Set<InvoiceStatus>>(new Set());
  const [activeOnly, setActiveOnly] = React.useState(false);

  const [preview, setPreview] = React.useState<{
    recipients: { familyId: string; familyName: string; destination: string | null }[];
    skipped: { familyId: string; familyName: string; destination: string | null }[];
  } | null>(null);

  const [broadcastStatus, setBroadcastStatus] = React.useState<string | null>(null);
  const [broadcastBusy, startBroadcast] = React.useTransition();
  const [activeTab, setActiveTab] = React.useState(defaultValue);

  const toggleLevel = (id: string) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleInvoiceStatus = (status: InvoiceStatus) => {
    setSelectedInvoiceStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  React.useEffect(() => {
    if (channel !== "EMAIL") {
      setDirectEmailReady(false);
    }
  }, [channel]);

  React.useEffect(() => {
    if (broadcastChannel !== "EMAIL") {
      setBroadcastEmailReady(false);
    }
  }, [broadcastChannel]);

  React.useEffect(() => {
    if (activeTab !== "direct") setDirectEmailReady(false);
    if (activeTab !== "broadcast") setBroadcastEmailReady(false);
  }, [activeTab]);

  React.useEffect(() => {
    if (mode === "direct" && onChannelChange) {
      onChannelChange(channel);
    }
  }, [channel, mode, onChannelChange]);

  React.useEffect(() => {
    if (mode === "broadcast" && onChannelChange) {
      onChannelChange(broadcastChannel);
    }
  }, [broadcastChannel, mode, onChannelChange]);

const exportEmailHtml = async (editor: React.RefObject<EmailBuilderHandle | null>) => {
  const instance = editor.current;
  if (!instance) throw new Error("Email editor not ready");

  const html = await instance.exportHtml();
  if (!html.trim()) throw new Error("Message cannot be empty");
  return html;
};


  const handleDirectSend = () => {
    startDirect(async () => {
      setDirectStatus(null);
      const body =
        channel === "SMS" ? directSmsMessage : await exportEmailHtml(directEmailEditorRef).catch((error) => {
          setDirectStatus(error instanceof Error ? error.message : "Message cannot be empty");
          return null;
        });

      if (!body) return;

      const res = await sendDirectMessageAction({
        familyId,
        channel,
        body,
        subject: subject || undefined,
      });

      if (res.ok) {
        setDirectStatus("Message sent");
        setDirectSmsMessage("");
        setSubject("");
        if (channel === "EMAIL") directEmailEditorRef.current?.clear();
      } else {
        setDirectStatus(res.error ?? "Failed to send");
      }
    });
  };

  const previewBroadcast = () => {
    startBroadcast(async () => {
      const res = await previewBroadcastRecipientsAction({
        channel: broadcastChannel,
        filters: {
          levelIds: Array.from(selectedLevels),
          invoiceStatuses: Array.from(selectedInvoiceStatuses),
          activeEnrolments: activeOnly,
        },
      });
      setPreview(res);
      setBroadcastStatus(null);
    });
  };

  const sendBroadcast = () => {
    startBroadcast(async () => {
      setBroadcastStatus(null);

      const body =
        broadcastChannel === "SMS"
          ? broadcastSmsMessage
          : await exportEmailHtml(broadcastEmailEditorRef).catch((error) => {
              setBroadcastStatus(error instanceof Error ? error.message : "Message cannot be empty");
              return null;
            });

      if (!body) return;

      const res = await sendBroadcastAction({
        channel: broadcastChannel,
        body,
        subject: broadcastSubject || undefined,
        filters: {
          levelIds: Array.from(selectedLevels),
          invoiceStatuses: Array.from(selectedInvoiceStatuses),
          activeEnrolments: activeOnly,
        },
      });

      if ("ok" in res && res.ok) {
        setBroadcastStatus("Broadcast sent");
        setBroadcastSmsMessage("");
        setBroadcastSubject("");
        if (broadcastChannel === "EMAIL") broadcastEmailEditorRef.current?.clear();
        setPreview(null);
      } else {
        setBroadcastStatus((res).error ?? "Failed to send");
      }
    });
  };

  const directContent = (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">Direct message</div>
        <p className="text-xs text-muted-foreground">Send a single SMS or Email to a family.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs">Family</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-2 text-sm"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            <option value="">Select family…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Channel</Label>
          <div className="flex gap-2">
            <Button type="button" variant={channel === "SMS" ? "default" : "outline"} onClick={() => setChannel("SMS")}>
              SMS
            </Button>
            <Button
              type="button"
              variant={channel === "EMAIL" ? "default" : "outline"}
              onClick={() => setChannel("EMAIL")}
            >
              Email
            </Button>
          </div>
        </div>
      </div>

      {channel === "EMAIL" ? (
        <div className="mt-4 space-y-2">
          <Label className="text-xs">Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <Label className="text-xs">Message</Label>
        {channel === "EMAIL" && activeTab === "direct" ? (
          <EmailBuilder ref={directEmailEditorRef} onReady={() => setDirectEmailReady(true)} />
        ) : null}
        {channel === "SMS" ? (
          <Textarea value={directSmsMessage} onChange={(e) => setDirectSmsMessage(e.target.value)} rows={5} />
        ) : null}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{channel === "SMS" ? `${directSmsMessage.length} characters` : "Use the builder to craft your email."}</span>
          <Button
            type="button"
            onClick={handleDirectSend}
            disabled={
              !familyId ||
              directBusy ||
              (channel === "SMS" ? !directSmsMessage.trim() : !directEmailReady)
            }
          >
            {directBusy ? "Sending…" : "Send"}
          </Button>
        </div>
        {directStatus ? <div className="mt-2 text-xs text-muted-foreground">{directStatus}</div> : null}
      </div>
    </div>
  );

  const broadcastContent = (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">Broadcast</div>
        <p className="text-xs text-muted-foreground">
          Send one message to multiple families based on filters. Preview recipients before sending.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs">Channel</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={broadcastChannel === "SMS" ? "default" : "outline"}
              onClick={() => setBroadcastChannel("SMS")}
            >
              SMS
            </Button>
            <Button
              type="button"
              variant={broadcastChannel === "EMAIL" ? "default" : "outline"}
              onClick={() => setBroadcastChannel("EMAIL")}
            >
              Email
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Levels</Label>
          <div className="flex flex-wrap gap-2">
            {levels.map((lvl) => (
              <Badge
                key={lvl.id}
                variant={selectedLevels.has(lvl.id) ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => toggleLevel(lvl.id)}
              >
                {lvl.name}
              </Badge>
            ))}
            {levels.length === 0 ? <div className="text-xs text-muted-foreground">No levels found.</div> : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Invoice status</Label>
          <div className="flex flex-wrap gap-2">
            {invoiceStatuses.map((st) => (
              <Badge
                key={st}
                variant={selectedInvoiceStatuses.has(st) ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => toggleInvoiceStatus(st)}
              >
                {st}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <input
          id="activeOnly"
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="activeOnly" className="text-xs">
          Only families with active enrolments
        </Label>
      </div>

      {broadcastChannel === "EMAIL" ? (
        <div className="mt-4 space-y-2">
          <Label className="text-xs">Subject</Label>
          <Input value={broadcastSubject} onChange={(e) => setBroadcastSubject(e.target.value)} />
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <Label className="text-xs">Message</Label>
        {broadcastChannel === "EMAIL" && activeTab === "broadcast" ? (
          <EmailBuilder ref={broadcastEmailEditorRef} onReady={() => setBroadcastEmailReady(true)} />
        ) : null}
        {broadcastChannel === "SMS" ? (
          <Textarea value={broadcastSmsMessage} onChange={(e) => setBroadcastSmsMessage(e.target.value)} rows={5} />
        ) : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {broadcastChannel === "SMS"
              ? `${broadcastSmsMessage.length} characters`
              : "Use the builder to craft your email."}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={previewBroadcast} disabled={broadcastBusy}>
              {broadcastBusy ? "Loading…" : "Preview"}
            </Button>
            <Button
              type="button"
              onClick={sendBroadcast}
              disabled={
                broadcastBusy ||
                (broadcastChannel === "SMS"
                  ? !broadcastSmsMessage.trim()
                  : !broadcastEmailReady)
              }
            >
              {broadcastBusy ? "Sending…" : "Send broadcast"}
            </Button>
          </div>
        </div>

        {broadcastStatus ? <div className="mt-2 text-xs text-muted-foreground">{broadcastStatus}</div> : null}
      </div>

      {preview ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="text-sm font-semibold">Recipients ({preview.recipients.length})</div>
            <div className="mt-2 max-h-56 overflow-y-auto text-xs">
              {preview.recipients.length === 0 ? (
                <div className="text-muted-foreground">No recipients.</div>
              ) : (
                preview.recipients.map((r) => (
                  <div key={r.familyId} className="border-b py-2 last:border-0">
                    <div className="font-medium">{r.familyName}</div>
                    <div className="text-muted-foreground">{r.destination ?? "—"}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="text-sm font-semibold">Skipped ({preview.skipped.length})</div>
            <div className="mt-2 max-h-56 overflow-y-auto text-xs">
              {preview.skipped.length === 0 ? (
                <div className="text-muted-foreground">None skipped.</div>
              ) : (
                preview.skipped.map((r) => (
                  <div key={r.familyId} className="border-b py-2 last:border-0">
                    <div className="font-medium">{r.familyName}</div>
                    <div className="text-muted-foreground">Missing contact info</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!showTabs && mode === "direct") {
    return <div className="space-y-4">{directContent}</div>;
  }

  if (!showTabs && mode === "broadcast") {
    return <div className="space-y-4">{broadcastContent}</div>;
  }

  return (
    <Tabs
      defaultValue={defaultValue}
      className="w-full"
      onValueChange={(value) => setActiveTab(value as "direct" | "broadcast")}
    >
      {showTabs ? (
        <TabsList className="w-fit">
          <TabsTrigger value="direct">Direct</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
        </TabsList>
      ) : null}

      <TabsContent value="direct" className={cn(showTabs ? "mt-4" : "mt-0", "space-y-4")}>
        {directContent}
      </TabsContent>

      <TabsContent value="broadcast" className={cn(showTabs ? "mt-4" : "mt-0", "space-y-4")}>
        {broadcastContent}
      </TabsContent>
    </Tabs>
  );
}
