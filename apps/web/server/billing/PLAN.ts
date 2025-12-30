/**
 * Billing refactor plan (internal notes):
 *
 * Current entry points that create / update / pay invoices:
 * - server/invoicing/index.ts: createInitialInvoiceForEnrolment, issueNextInvoiceForEnrolment,
 *   markInvoicePaid, runInvoicingSweep, maybeRunInvoicingSweep, getUnpaidFamiliesSummary.
 * - server/billing actions: createInvoice, updateInvoice, deleteInvoice, createPayAheadInvoice,
 *   purchaseCredits (credits invoice), createPayment (with allocation + entitlement),
 *   recordFamilyPayment, updatePayment, deletePayment, autoAllocatePayment, getFamilyBillingSummary,
 *   getBillingDashboardData, getFamilyBillingData.
 * - Enrolment flows: server/enrolment/createEnrolment.ts calls createInitialInvoiceForEnrolment.
 * - UI surfaces showing totals/status: admin billing page (InvoiceTable, InvoiceForm), family
 *   profile invoices (FamilyInvoices), counter page (payments + pay-ahead), dashboard cards,
 *   unpaid families indicator, messages filters (invoice status), billing dashboards.
 *
 * Target design:
 * - Introduce InvoiceLineItem + Product models; invoices derive totals from line items.
 * - Shared server/billing module will expose the only mutators:
 *   recalculateInvoiceTotals(invoiceId), createInvoiceWithLineItems, createPaymentAndAllocate,
 *   allocatePaymentOldestOpenInvoices, and helper loaders.
 * - All existing flows (enrolment invoicing, pay-ahead, manual invoice CRUD, sweep) rebuilt to
 *   create line items (ENROLMENT/PRODUCT/DISCOUNT/ADJUSTMENT) then recalc totals.
 * - Entitlement updates (paidThroughDate / creditsRemaining) triggered only when an invoice
 *   containing ENROLMENT line items becomes paid; product-only invoices skip entitlement.
 * - UI updates: invoice list/detail shows line items, payment forms pull balances from recalculated
 *   totals; counter page gains product basket + quick “Counter Sale” fallback family checkout.
 * - Data migration: backfill script will create ADJUSTMENT line items for existing invoices and
 *   align amountCents to the summed line items while preserving historical payments.
 */
