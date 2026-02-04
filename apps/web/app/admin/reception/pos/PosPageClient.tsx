"use client";

import * as React from "react";
import type { Product, ProductCategory } from "@prisma/client";
import {
  Minus,
  Plus,
  Printer,
  ScanLine,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/navigation/BackButton";

import { formatCurrencyFromCents, dollarsToCents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { POS_TAX_RATE, calculateTaxCents } from "@/lib/pos/config";
import { getReceiptPrinterAdapter } from "@/lib/pos/receiptPrinter";
import { useBarcodeScanner } from "@/lib/pos/useBarcodeScanner";

import { createPosSale } from "@/server/pos/createPosSale";

type PosCategory = ProductCategory & { products: Product[] };

type CartLine = {
  productId: string;
  quantity: number;
};

type SaleResult = Awaited<ReturnType<typeof createPosSale>>;

type PosPageClientProps = {
  categories: PosCategory[];
};

export default function PosPageClient({ categories }: PosPageClientProps) {
  const [catalog, setCatalog] = React.useState<PosCategory[]>(categories);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(categories[0]?.id ?? null);
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [note, setNote] = React.useState("");
  const [discountInput, setDiscountInput] = React.useState("");
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState<"CASH" | "CARD" | "OTHER">("CASH");
  const [processing, setProcessing] = React.useState(false);
  const [lastSale, setLastSale] = React.useState<SaleResult | null>(null);
  const [scannerEnabled, setScannerEnabled] = React.useState(true);

  React.useEffect(() => {
    setCatalog(categories);
  }, [categories]);

  React.useEffect(() => {
    if (catalog.length === 1) {
      setSelectedCategoryId(catalog[0].id);
      return;
    }
    if (selectedCategoryId && catalog.some((category) => category.id === selectedCategoryId)) return;
    setSelectedCategoryId(catalog[0]?.id ?? null);
  }, [catalog, selectedCategoryId]);

  const products = React.useMemo(
    () => catalog.flatMap((category) => category.products),
    [catalog]
  );

  const productsById = React.useMemo(() => {
    const map = new Map<string, (typeof products)[number]>();
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }, [products]);

  const productsByBarcode = React.useMemo(() => {
    const map = new Map<string, (typeof products)[number]>();
    for (const product of products) {
      if (product.barcode) {
        map.set(product.barcode, product);
      }
    }
    return map;
  }, [products]);

  const selectedCategory = catalog.find((category) => category.id === selectedCategoryId) ?? null;

  const cartItems = React.useMemo(() => {
    return Object.entries(cart)
      .map(([productId, quantity]) => ({
        product: productsById.get(productId),
        quantity,
      }))
      .filter((entry) => entry.product && entry.quantity > 0)
      .map((entry) => ({
        product: entry.product!,
        quantity: entry.quantity,
      }));
  }, [cart, productsById]);

  const subtotalCents = React.useMemo(
    () => cartItems.reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0),
    [cartItems]
  );

  const discountCents = React.useMemo(() => {
    const raw = discountInput.trim();
    if (!raw) return 0;
    return Math.max(0, dollarsToCents(raw));
  }, [discountInput]);

  const appliedDiscountCents = Math.min(discountCents, subtotalCents);
  const taxCents = calculateTaxCents(subtotalCents - appliedDiscountCents);
  const totalCents = subtotalCents - appliedDiscountCents + taxCents;

  const handleBarcodeScan = React.useCallback(
    (barcode: string) => {
      const product = productsByBarcode.get(barcode);
      if (!product) {
        toast.error("Barcode not found.");
        return;
      }
      setSelectedCategoryId(product.categoryId);
      setCart((prev) => ({
        ...prev,
        [product.id]: (prev[product.id] ?? 0) + 1,
      }));
      setLastSale(null);
      toast.success(`Added ${product.name}`);
    },
    [productsByBarcode]
  );

  const { inputRef, inputProps, focusScanner } = useBarcodeScanner({
    enabled: scannerEnabled,
    onScan: handleBarcodeScan,
  });

  const addToCart = (productId: string) => {
    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? 0) + 1,
    }));
    setLastSale(null);
  };

  const updateQuantity = (productId: string, nextQuantity: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (nextQuantity <= 0) {
        delete next[productId];
      } else {
        next[productId] = nextQuantity;
      }
      return next;
    });
  };

  const clearCart = () => {
    setCart({});
    setNote("");
    setDiscountInput("");
  };

  const handleCompleteSale = async () => {
    if (cartItems.length === 0) return;
    setProcessing(true);

    const items: CartLine[] = cartItems.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    }));

    const result = await runMutationWithToast(
      () =>
        createPosSale({
          items,
          discountCents: appliedDiscountCents,
          notes: note.trim() || null,
          paymentMethod,
        }),
      {
        pending: { title: "Completing sale..." },
        success: { title: "Sale completed" },
        error: (message) => ({
          title: "Unable to complete sale",
          description: message,
        }),
      }
    );

    if (!result) {
      setProcessing(false);
      return;
    }

    setLastSale(result);
    clearCart();
    setCheckoutOpen(false);

    const quantityById = new Map(items.map((item) => [item.productId, item.quantity]));
    setCatalog((prev) =>
      prev.map((category) => ({
        ...category,
        products: category.products.map((product) => {
          const quantity = quantityById.get(product.id);
          if (!quantity || !product.trackInventory) return product;
          return { ...product, stockOnHand: Math.max(0, product.stockOnHand - quantity) };
        }),
      }))
    );

    try {
      const adapter = getReceiptPrinterAdapter();
      await Promise.resolve(
        adapter.printReceipt({
          sale: {
            id: result.id,
            saleNo: result.saleNo,
            subtotalCents: result.subtotalCents,
            discountCents: result.discountCents,
            totalCents: result.totalCents,
            createdAt: new Date(result.createdAt),
            completedAt: result.completedAt ? new Date(result.completedAt) : null,
            notes: result.notes,
          },
          lineItems: result.lineItems.map((item) => ({
            name: item.nameSnapshot,
            quantity: item.quantity,
            priceCents: item.priceCentsSnapshot,
            lineTotalCents: item.lineTotalCents,
          })),
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to print receipt.";
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintLastReceipt = async () => {
    if (!lastSale) return;
    try {
      const adapter = getReceiptPrinterAdapter();
      await Promise.resolve(
        adapter.printReceipt({
          sale: {
            id: lastSale.id,
            saleNo: lastSale.saleNo,
            subtotalCents: lastSale.subtotalCents,
            discountCents: lastSale.discountCents,
            totalCents: lastSale.totalCents,
            createdAt: new Date(lastSale.createdAt),
            completedAt: lastSale.completedAt ? new Date(lastSale.completedAt) : null,
            notes: lastSale.notes,
          },
          lineItems: lastSale.lineItems.map((item) => ({
            name: item.nameSnapshot,
            quantity: item.quantity,
            priceCents: item.priceCentsSnapshot,
            lineTotalCents: item.lineTotalCents,
          })),
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to print receipt.";
      toast.error(message);
    }
  };

  const handleFocusScanner = () => {
    setScannerEnabled(true);
    focusScanner();
  };

  const handleNewSale = () => {
    setLastSale(null);
    clearCart();
    handleFocusScanner();
  };

  const handleTextFocus = () => setScannerEnabled(false);
  const handleTextBlur = () => {
    handleFocusScanner();
  };

  const canCheckout = cartItems.length > 0 && !processing;

  const taxLabel = POS_TAX_RATE > 0 ? `Tax (${(POS_TAX_RATE * 100).toFixed(1)}%)` : "Tax";

  return (
    <div className="flex h-full flex-col">
      <input
        ref={inputRef}
        className="sr-only"
        aria-label="Barcode scanner"
        autoComplete="off"
        {...inputProps}
      />
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BackButton label="Back" />
            <div>
              <h1 className="text-lg font-semibold">POS</h1>
              <p className="text-xs text-muted-foreground">
                Select a category, then tap a product to add it.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleFocusScanner}>
              <ScanLine className="h-4 w-4" />
              Scanner ready
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-6">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
            <Card className="border-l-0! shadow-none">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Categories</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {catalog.length}
                </Badge>
              </CardHeader>
              <CardContent>
                {catalog.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No categories yet. Add one in settings.
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
                    {catalog.map((category) => {
                      const isSelected = category.id === selectedCategoryId;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(category.id)}
                          className={cn(
                            "flex shrink-0 items-center justify-between gap-2 rounded-full border px-3 py-2 text-sm transition lg:rounded-lg",
                            isSelected
                              ? "border-primary/40 bg-primary/5 text-primary"
                              : "hover:bg-muted/40"
                          )}
                        >
                          <span className="whitespace-nowrap">{category.name}</span>
                          <span className="text-xs text-muted-foreground">{category.products.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-0! shadow-none">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {selectedCategory ? selectedCategory.name : "Products"}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {selectedCategory ? selectedCategory.products.length : 0}
                </Badge>
              </CardHeader>
              <CardContent>
                {!selectedCategory ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Select a category to view products.
                  </div>
                ) : selectedCategory.products.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No products in this category yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {selectedCategory.products.map((product) => {
                      const lowStock =
                        product.trackInventory &&
                        product.lowStockThreshold != null &&
                        product.stockOnHand <= product.lowStockThreshold;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(product.id)}
                          className="flex min-h-[96px] flex-col justify-between rounded-lg border p-3 text-left transition hover:bg-muted/40"
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-semibold leading-tight">{product.name}</div>
                            {lowStock ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Low stock
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-sm font-semibold">
                            {formatCurrencyFromCents(product.priceCents)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-0! shadow-none">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Cart</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {cartItems.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {lastSale ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="text-sm font-semibold">Sale #{lastSale.saleNo} complete</div>
                    <div className="text-xs text-muted-foreground">
                      Total {formatCurrencyFromCents(lastSale.totalCents)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={handleNewSale}>
                        New sale
                      </Button>
                      <Button size="sm" variant="outline" onClick={handlePrintLastReceipt}>
                        <Printer className="h-4 w-4" />
                        Print receipt
                      </Button>
                    </div>
                  </div>
                ) : null}

                {cartItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Cart is empty.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cartItems.map((item) => (
                      <div key={item.product.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrencyFromCents(item.product.priceCents)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <div className="w-8 text-center text-sm font-semibold">{item.quantity}</div>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => updateQuantity(item.product.id, 0)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold">{formatCurrencyFromCents(subtotalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-muted-foreground" htmlFor="discount-input">
                      Discount
                    </label>
                    <Input
                      id="discount-input"
                      inputMode="decimal"
                      className="h-8 w-24 text-right"
                      value={discountInput}
                      onChange={(event) => setDiscountInput(event.target.value)}
                      onFocus={handleTextFocus}
                      onBlur={handleTextBlur}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{taxLabel}</span>
                    <span className="font-semibold">{formatCurrencyFromCents(taxCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span>Total</span>
                    <span className="font-semibold">{formatCurrencyFromCents(totalCents)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="sale-note" className="text-xs text-muted-foreground">
                    Sale note (optional)
                  </label>
                  <Textarea
                    id="sale-note"
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    onFocus={handleTextFocus}
                    onBlur={handleTextBlur}
                    placeholder="Add a quick note"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => setCheckoutOpen(true)}
                    disabled={!canCheckout}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Complete sale
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={clearCart}
                    disabled={cartItems.length === 0}
                  >
                    Clear cart
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm sale</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Items</span>
                <span className="font-semibold">{cartItems.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total</span>
                <span className="font-semibold">{formatCurrencyFromCents(totalCents)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Payment method</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "CASH", label: "Cash" },
                  { id: "CARD", label: "Card" },
                  { id: "OTHER", label: "Other" },
                ] as const).map((method) => (
                  <Button
                    key={method.id}
                    variant={paymentMethod === method.id ? "default" : "outline"}
                    onClick={() => setPaymentMethod(method.id)}
                  >
                    {method.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCheckoutOpen(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button onClick={handleCompleteSale} disabled={!canCheckout}>
              {processing ? "Processing..." : "Confirm sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
