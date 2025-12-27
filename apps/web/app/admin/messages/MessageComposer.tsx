// app/(app)/admin/messages/MessageComposer.tsx
"use client"

import * as React from "react"
import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { Filter, Users, Mail, Phone, Send, Copy, Trash2, ChevronDown } from "lucide-react"

import EmailMarketingPane from "@/components/admin/messages/EmailMarketingPane"

import { sendSmsAction } from "@/server/messages/sendSms"
import { useTransition } from "react"
import type { ClientRecipient, InvoiceStatus, LevelLite, ClassLite } from "@/types/admin/recipients"

type Json = string | number | boolean | null | { [key: string]: Json } | Json[]
type CommandCreatePayload = { key: "message"; href: string }
const COMMAND_CREATE_EVENT = "command:create"
const COMMAND_CREATE_STORAGE_KEY = "command:create"

type Channel = "EMAIL" | "SMS"

type Props = {
  recipients: ClientRecipient[]
  levels: LevelLite[]
  classes: ClassLite[]
  invoiceStatusOptions: InvoiceStatus[]
}

export default function MessageComposer({
  recipients,
  levels,
  classes,
  invoiceStatusOptions,
}: Props) {
  // ------------ Local state ------------
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const [channel, setChannel] = useState<Channel>("EMAIL")
  const [includeSecondary, setIncludeSecondary] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLevelIds, setSelectedLevelIds] = useState<Set<string>>(new Set())
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [selectedInvoiceStatuses, setSelectedInvoiceStatuses] = useState<Set<InvoiceStatus>>(new Set());
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState("")

  const [previewPayload, setPreviewPayload] = useState<Json | null>(null);
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)

  const [isSending, startSend] = useTransition()

  const isCurrentLocation = useCallback((href: string) => {
    if (typeof window === "undefined") return false
    try {
      const target = new URL(href, window.location.origin)
      const current = new URL(window.location.href)
      return target.pathname === current.pathname && target.search === current.search
    } catch (error) {
      console.error("Failed to compare command create href", error)
      return false
    }
  }, [])

  const focusMessageComposer = useCallback(() => {
    requestAnimationFrame(() => {
      messageRef.current?.focus()
    })
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const consumePayload = (payload: CommandCreatePayload | undefined | null) => {
      if (!payload || payload.key !== "message") return false
      if (!isCurrentLocation(payload.href)) return false

      window.sessionStorage.removeItem(COMMAND_CREATE_STORAGE_KEY)
      setIsSelectionOpen(true)
      focusMessageComposer()
      return true
    }

    const storedRaw = window.sessionStorage.getItem(COMMAND_CREATE_STORAGE_KEY)
    if (storedRaw) {
      try {
        const storedPayload = JSON.parse(storedRaw) as CommandCreatePayload
        consumePayload(storedPayload)
      } catch (error) {
        console.error("Failed to parse command create payload", error)
        window.sessionStorage.removeItem(COMMAND_CREATE_STORAGE_KEY)
      }
    }

    const handleCommandCreate = (event: Event) => {
      const detail = (event as CustomEvent<CommandCreatePayload | undefined>).detail
      consumePayload(detail ?? null)
    }

    window.addEventListener(COMMAND_CREATE_EVENT, handleCommandCreate as EventListener)
    return () => {
      window.removeEventListener(COMMAND_CREATE_EVENT, handleCommandCreate as EventListener)
    }
  }, [focusMessageComposer, isCurrentLocation])

  
  // ------------ Derived helpers ------------
  const normalizedQuery = searchQuery.trim().toLowerCase()

  const toggleSet = useCallback(
    <T extends string>(
      setter: React.Dispatch<React.SetStateAction<Set<T>>>,
      id: T
    ) => {
      setter((prev: Set<T>) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    []
  );


  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setSelectedLevelIds(new Set())
    setSelectedClassIds(new Set())
    setSelectedInvoiceStatuses(new Set())
  }, [])

  const filteredClients = useMemo(() => {
    const matches: ClientRecipient[] = []
    for (const c of recipients) {
      // Text search: client name, student names, email, phone
      if (normalizedQuery) {
        const hay = [
          c.name,
          ...c.emails,
          ...c.phones,
          ...c.levels.map((l) => l.name),
          ...c.classes.map((cl) => cl.label),
        ]
          .join(" ")
          .toLowerCase()
        if (!hay.includes(normalizedQuery)) continue
      }

      // Level filter
      if (selectedLevelIds.size) {
        const hasLevel = c.levels.some((l) => selectedLevelIds.has(l.id))
        if (!hasLevel) continue
      }

      // Class filter
      if (selectedClassIds.size) {
        const hasClass = c.classes.some((cl) => selectedClassIds.has(cl.id))
        if (!hasClass) continue
      }

      // Invoice status filter (client passes if it has ANY invoice in selected statuses)
      if (selectedInvoiceStatuses.size) {
        const hasStatus = c.invoices.some((inv) => selectedInvoiceStatuses.has(inv.status))
        if (!hasStatus) continue
      }

      // Require at least one usable contact for the active channel
      const contacts =
        channel === "EMAIL"
          ? c.emails
          : c.phones // phones already sanitized server-side
      if (!contacts.length) continue

      matches.push(c)
    }
    return matches
  }, [
    recipients,
    normalizedQuery,
    selectedLevelIds,
    selectedClassIds,
    selectedInvoiceStatuses,
    channel,
  ])

  // Adjust selection when switching channels (drop invalids)
  const onChannelChange = useCallback(
    (next: Channel) => {
      if (next === channel) return
      const before = new Set(selectedClientIds)
      const after = new Set<string>()
      const removed: string[] = []
      for (const id of before) {
        const c = recipients.find((r) => r.id === id)
        if (!c) continue
        const ok = next === "EMAIL" ? c.emails.length > 0 : c.phones.length > 0
        if (ok) after.add(id)
        else removed.push(c.name)
      }
      if (removed.length) {
        toast.warning("Selection updated for channel", {
          description: `Removed ${removed.length} without ${next === "EMAIL" ? "email" : "phone"}.`,
        })
      }
      setSelectedClientIds(after)
      setChannel(next)
    },
    [channel, selectedClientIds, recipients]
  )

  const selectAllFiltered = useCallback(() => {
    setSelectedClientIds(new Set(filteredClients.map((c) => c.id)))
  }, [filteredClients])

  const clearSelection = useCallback(() => setSelectedClientIds(new Set()), [])

  const selectAllMatchesIntoSelection = useCallback(() => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev)
      for (const c of filteredClients) next.add(c.id)
      return next
    })
  }, [filteredClients])

  // Contacts for payload
  const resolvedSelection = useMemo(() => {
    const chosen = recipients.filter((c) => selectedClientIds.has(c.id))
    const skipped: string[] = []
    const selected = chosen.filter((c) => {
      const ok = channel === "EMAIL" ? c.emails.length > 0 : c.phones.length > 0
      if (!ok) skipped.push(c.name)
      return ok
    })
    return { selected, skipped }
  }, [recipients, selectedClientIds, channel])

  const selectedCount = resolvedSelection.selected.length

  // Build recipients string array
  const buildRecipientList = useCallback(
    (list: ClientRecipient[]): { recipientIds: string[]; contacts: string[]; clients: Array<{ id: string; name: string; contact: string }> } => {
      const contacts: string[] = []
      const clientsOut: Array<{ id: string; name: string; contact: string }> = []
      for (const c of list) {
        const base = channel === "EMAIL" ? c.emails : c.phones
        const arr = includeSecondary ? base : base.slice(0, Math.min(base.length, 1)) // first only if not including secondary
        for (const contact of arr) {
          const clean = channel === "EMAIL" ? contact.toLowerCase().trim() : contact.trim()
          if (!clean) continue
          contacts.push(clean)
          clientsOut.push({ id: c.id, name: c.name, contact: clean })
        }
      }
      const deduped = Array.from(new Set(contacts))
      return { recipientIds: list.map((c) => c.id), contacts: deduped, clients: clientsOut }
    },
    [channel, includeSecondary]
  )

  const onGenerate = useCallback(() => {
    const { selected, skipped } = resolvedSelection
    if (!selected.length) {
      toast.error("No recipients selected")
      return
    }
    const trimmed = message.trim()
    if (!trimmed) {
      toast.error("Message is empty")
      return
    }

    const { contacts, clients } = buildRecipientList(selected)

    const payload = {
      channel,
      message: trimmed,
      recipients: contacts,
      clients,
      createdAt: new Date().toISOString(),
    }
    setPreviewPayload(payload)
    console.log("Message payload", payload)
    toast.success("Payload ready", { description: `${contacts.length} recipient contact(s)` })
    if (skipped.length) {
      toast.message("Some clients skipped", { description: skipped.join(", ") })
    }
  }, [resolvedSelection, message, buildRecipientList, channel])

  const onCopy = useCallback(async () => {
    if (!previewPayload) return
    await navigator.clipboard.writeText(JSON.stringify(previewPayload, null, 2))
    toast.success("Copied payload to clipboard")
  }, [previewPayload])

  const onClearComposer = useCallback(() => {
    setMessage("")
    setPreviewPayload(null)
    setSelectedClientIds(new Set())
    setIsSelectionOpen(false)
  }, [])

    const onSend = useCallback(() => {
    const trimmed = message.trim()
    if (channel !== "SMS") {
      toast.error("Switch to SMS to send via Twilio.")
      return
    }
    if (!selectedCount || !trimmed) {
      toast.error("Select recipients and write a message.")
      return
    }
  
    // build recipients from your existing helper
    const { selected } = resolvedSelection
    const { contacts } = buildRecipientList(selected)
  
    startSend(async () => {
      try {
        const res = await sendSmsAction({ message: trimmed, recipients: contacts });
      
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      
        const { total, sent, failed } = res.summary;
        toast.success("SMS dispatched", { description: `${sent}/${total} sent, ${failed} failed` });
      } catch (e) {
        console.error(e)
        toast.error("Failed to dispatch");
      }
    })
  }, [channel, message, selectedCount, resolvedSelection, buildRecipientList])

  // ------------ UI ------------
  const Filters = (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </CardTitle>
        <CardDescription>Find clients by search, level, class, or invoice status.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Client, level, class, email, phone…"
          />
        </div>

        {/* Levels */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Levels</Label>
            <Badge variant="secondary">{selectedLevelIds.size}</Badge>
          </div>
          {levels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No levels available.</p>
          ) : levels.length > 8 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between w-full">
                  Choose levels <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-64">
                <ScrollArea className="h-60">
                  <div className="p-2 space-y-1">
                    {levels.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted">
                        <Checkbox
                          checked={selectedLevelIds.has(l.id)}
                          onCheckedChange={() => toggleSet(setSelectedLevelIds, l.id)}
                        />
                        <span className="text-sm">{l.name}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="space-y-1">
              {levels.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedLevelIds.has(l.id)}
                    onCheckedChange={() => toggleSet(setSelectedLevelIds, l.id)}
                  />
                  <span className="text-sm">{l.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Classes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Classes</Label>
            <Badge variant="secondary">{selectedClassIds.size}</Badge>
          </div>

          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes available.</p>
          ) : (
            <>
              <ClassMultiSelect
                classes={classes}
                selectedClassIds={selectedClassIds}
                onChange={setSelectedClassIds}
              />
              {selectedClassIds.size > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedClassIds).map((id) => {
                    const c = classes.find((x) => x.id === id)
                    if (!c) return null
                    return (
                      <Badge key={id} variant="outline" className="gap-1">
                        {c.dayOfWeek} • {formatHumanTime(c.startTime)}
                        {c.location ? ` • ${c.location}` : ""}
                        <button
                          type="button"
                          className="ml-1 opacity-70 hover:opacity-100"
                          onClick={() =>
                            setSelectedClassIds((prev) => {
                              const next = new Set(prev)
                              next.delete(id)
                              return next
                            })
                          }
                          aria-label="Remove class"
                          title="Remove"
                        >
                          ×
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedClassIds(new Set())}
                  disabled={selectedClassIds.size === 0}
                >
                  Clear classes
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Invoice statuses */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Invoice status</Label>
            <Badge variant="secondary">{selectedInvoiceStatuses.size}</Badge>
          </div>
          {invoiceStatusOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoice status options.</p>
          ) : (
            <div className="space-y-1">
              {invoiceStatusOptions.map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedInvoiceStatuses.has(s)}
                    onCheckedChange={() => toggleSet(setSelectedInvoiceStatuses, s)}
                  />
                  <span className="text-sm">{readableStatus(s)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
          <Button variant="outline" size="sm" onClick={selectAllMatchesIntoSelection}>
            Select all matches
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const SelectionPanel = (
    <Card className="flex flex-col">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              <Users className="mr-1 h-3.5 w-3.5" /> {filteredClients.length} matched
            </Badge>
            <Badge>Selected: {selectedCount}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAllFiltered}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          </div>
        </div>

        <Tabs value={channel} onValueChange={(v) => onChannelChange(v as Channel)} className="w-full">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="EMAIL" className="capitalize">
              <Mail className="mr-2 h-4 w-4" /> Email
            </TabsTrigger>
            <TabsTrigger value="SMS" className="capitalize">
              <Phone className="mr-2 h-4 w-4" /> SMS
            </TabsTrigger>
          </TabsList>
          <TabsContent value="EMAIL" />
          <TabsContent value="SMS" />
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 overflow-hidden">
        <div className="border rounded-lg">
          <ScrollArea className="h-[420px]">
            {filteredClients.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No clients match your current filters.
              </div>
            ) : (
              <div className="divide-y">
                {filteredClients.map((c) => {
                  const checked = selectedClientIds.has(c.id)
                  const contactBadges =
                    channel === "EMAIL"
                      ? c.emails.map((e) => (
                          <Badge key={e} variant="outline" className="gap-1">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{e}</span>
                          </Badge>
                        ))
                      : c.phones.map((p) => (
                          <Badge key={p} variant="outline" className="gap-1">
                            <Phone className="h-3 w-3" />
                            <span className="truncate">{p}</span>
                          </Badge>
                        ))

                  return (
                    <div key={c.id} className="flex items-start justify-between gap-4 p-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Checkbox
                          className="mt-1"
                          checked={checked}
                          onCheckedChange={() =>
                            setSelectedClientIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(c.id)) next.delete(c.id)
                              else next.add(c.id)
                              return next
                            })
                          }
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium truncate">{c.name}</span>
                            <div className="flex flex-wrap gap-1">{contactBadges}</div>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.levels.map((l) => (
                              <Badge key={l.id} variant="outline">
                                {l.name}
                              </Badge>
                            ))}
                            {c.classes.map((cl) => (
                              <Badge key={cl.id} variant="outline">
                                {cl.label}
                              </Badge>
                            ))}
                            {c.invoices.map((inv) => (
                              <Badge
                                key={inv.id}
                                variant={inv.isOverdue ? "destructive" : "outline"}
                                className="uppercase"
                              >
                                {readableStatus(inv.status)}
                              </Badge>
                            ))}
                          </div>
                          {c.notes ? (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.notes}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Button variant="link" asChild className="px-0 h-auto">
                          <Link href={`/admin/client/${c.id}`}>View client</Link>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <Dialog open={isSelectionOpen} onOpenChange={setIsSelectionOpen}>
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  <Users className="mr-1 h-3.5 w-3.5" /> {selectedCount} selected
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1 capitalize">
                  {channel === "EMAIL" ? <Mail className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                  {channel === "EMAIL" ? "Email" : "SMS"} channel
                </Badge>
              </div>
              <DialogTrigger asChild>
                <Button variant="outline">Manage recipients</Button>
              </DialogTrigger>
            </div>

            <Tabs value={channel} onValueChange={(v) => onChannelChange(v as Channel)} className="w-full md:w-auto">
              <TabsList className="grid grid-cols-2 md:w-auto">
                <TabsTrigger value="EMAIL" className="capitalize">
                  <Mail className="mr-2 h-4 w-4" /> Email
                </TabsTrigger>
                <TabsTrigger value="SMS" className="capitalize">
                  <Phone className="mr-2 h-4 w-4" /> SMS
                </TabsTrigger>
              </TabsList>
              <TabsContent value="EMAIL" />
              <TabsContent value="SMS" />
            </Tabs>

            <div className="flex items-center gap-2">
              <Switch
                id="include-secondary"
                checked={includeSecondary}
                onCheckedChange={setIncludeSecondary}
              />
              <Label htmlFor="include-secondary" className="text-sm">
                Include secondary contacts
              </Label>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
          {channel === "EMAIL" ? (
            <EmailMarketingPane selectedClients={resolvedSelection.selected} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type an SMS to selected clients…"
                className="min-h-[140px]"
              />
              <div
                className={
                  "text-xs " +
                  (message.length > 500 ? "text-destructive" : "text-muted-foreground")
                }
              >
                {message.length} / 500
              </div>
            </div>
          )}

            <div className="space-y-2">
              <Label>Selected clients</Label>
              {selectedCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No clients selected yet. Use “Manage recipients” to choose who should receive this message.
                </p>
              ) : (
                <ScrollArea className="max-h-48 rounded-md border">
                  <div className="p-3 space-y-3">
                    {resolvedSelection.selected.map((c) => {
                      const contactBadges =
                        channel === "EMAIL"
                          ? c.emails.map((e) => (
                              <Badge key={e} variant="outline" className="gap-1">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{e}</span>
                              </Badge>
                            ))
                          : c.phones.map((p) => (
                              <Badge key={p} variant="outline" className="gap-1">
                                <Phone className="h-3 w-3" />
                                <span className="truncate">{p}</span>
                              </Badge>
                            ))

                      return (
                        <div key={c.id} className="space-y-1">
                          <p className="text-sm font-medium leading-none">{c.name}</p>
                          <div className="flex flex-wrap gap-1">{contactBadges}</div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
              {resolvedSelection.skipped.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {resolvedSelection.skipped.length} client{resolvedSelection.skipped.length > 1 ? "s" : ""} without
                  {" "}
                  {channel === "EMAIL" ? "email" : "phone"} contact were skipped automatically.
                </p>
              ) : null}
            </div>
          </CardContent>
          {channel !== "EMAIL" && (
            <>
              <CardFooter className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={channel === "SMS" ? onSend : onGenerate}
                  disabled={
                    selectedCount === 0 ||
                    message.trim().length === 0 ||
                    (channel === "SMS" && isSending)
                  }
                >
                  <Send className="mr-2 h-4 w-4" />
                  {channel === "SMS" ? (isSending ? "Sending…" : "Send SMS") : "Send message"}
                </Button>
                <Button variant="outline" onClick={onCopy} disabled={!previewPayload}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy payload
                </Button>
                <Button variant="ghost" onClick={onClearComposer}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </CardFooter> 
                
              {previewPayload ? (
                <div className="px-6 pb-6">
                  <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
                    {JSON.stringify(previewPayload, null, 2)}
                  </pre>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <DialogContent className="max-w-6xl max-h-[75vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <DialogTitle>Select recipients</DialogTitle>
          <DialogDescription>
            Filter clients and choose who should receive this message. Selections are saved automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          {Filters}
          {SelectionPanel}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Local utils ----------
function formatHumanTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10))
  const dt = new Date()
  dt.setHours(h, m || 0, 0, 0)
  return dt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
}

function readableStatus(s: string) {
  return s
    .toLowerCase()
    .split("_")
    .map((t) => t[0]?.toUpperCase() + t.slice(1))
    .join(" ")
}

// ClassMultiSelect: popover with searchable list, click to add; supports adding multiple
function ClassMultiSelect({
  classes,
  selectedClassIds,
  onChange,
}: {
  classes: ClassLite[]
  selectedClassIds: Set<string>
  onChange: React.Dispatch<React.SetStateAction<Set<string>>>
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    const notSelected = classes.filter((c) => !selectedClassIds.has(c.id))
    if (!q) return notSelected
    return notSelected.filter((c) => {
      const label = `${c.dayOfWeek} ${c.startTime} ${c.location ?? ""}`.toLowerCase()
      return label.includes(q)
    })
  }, [classes, selectedClassIds, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          {selectedClassIds.size > 0
            ? `${selectedClassIds.size} class${selectedClassIds.size > 1 ? "es" : ""} selected`
            : "Select classes"}
          <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[360px]">
        <div className="p-3 border-b">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes…"
          />
        </div>
        <ScrollArea className="h-64">
          {available.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No classes found.</div>
          ) : (
            <div className="p-2 space-y-1">
              {available.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left p-2 rounded-md hover:bg-muted"
                  onClick={() => {
                    onChange((prev) => {
                      const next = new Set(prev)
                      next.add(c.id)
                      return next
                    })
                  }}
                >
                  <div className="text-sm">
                    {c.dayOfWeek} • {formatHumanTime(c.startTime)}
                    {c.location ? ` • ${c.location}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t flex items-center justify-end">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
