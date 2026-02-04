export type ReceiptSchoolInfo = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type ReceiptLineItem = {
  name: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
};

export type ReceiptSaleSummary = {
  id: string;
  saleNo: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  createdAt: Date;
  completedAt?: Date | null;
  notes?: string | null;
};

export type ReceiptPrintPayload = {
  sale: ReceiptSaleSummary;
  lineItems: ReceiptLineItem[];
  schoolInfo?: ReceiptSchoolInfo;
};

export type ReceiptPrinterAdapter = {
  // Swap this adapter to integrate with ESC/POS, Star, or custom drivers.
  printReceipt: (payload: ReceiptPrintPayload) => Promise<void> | void;
};

const noopReceiptPrinter: ReceiptPrinterAdapter = {
  async printReceipt() {
    return;
  },
};

let activePrinter: ReceiptPrinterAdapter = noopReceiptPrinter;

// Register a custom adapter at runtime (for example in app startup code).
export function setReceiptPrinterAdapter(adapter: ReceiptPrinterAdapter) {
  activePrinter = adapter;
}

export function getReceiptPrinterAdapter() {
  return activePrinter;
}

export function resetReceiptPrinterAdapter() {
  activePrinter = noopReceiptPrinter;
}
