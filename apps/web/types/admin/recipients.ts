export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID" | "OVERDUE"

export type LevelLite = {
  id: string
  name: string
}

export type ClassLite = {
  id: string
  label: string
  dayOfWeek: string
  startTime: string
  location?: string | null
}

export type ClientInvoice = {
  id: string
  status: InvoiceStatus
  isOverdue: boolean
}

export type ClientRecipient = {
  id: string
  name: string
  emails: string[]
  phones: string[]
  notes?: string | null
  levels: LevelLite[]
  classes: ClassLite[]
  invoices: ClientInvoice[]
}
