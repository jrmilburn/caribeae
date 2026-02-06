"use client";

import * as React from "react";
import type { Product, ProductCategory } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { centsToDollarString, dollarsToCents } from "@/lib/currency";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { createProduct } from "@/server/products/createProduct";
import { updateProduct } from "@/server/products/updateProduct";

const DEFAULT_STATE = {
  name: "",
  price: "",
  sku: "",
  barcode: "",
  categoryId: "",
  trackInventory: true,
  stockOnHand: "0",
  lowStockThreshold: "",
  isActive: true,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  defaultCategoryId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  categories: ProductCategory[];
  defaultCategoryId: string | null;
  onSaved: () => void;
}) {
  const mode: "create" | "edit" = product ? "edit" : "create";
  const [form, setForm] = React.useState(DEFAULT_STATE);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        price: centsToDollarString(product.priceCents),
        sku: product.sku ?? "",
        barcode: product.barcode ?? "",
        categoryId: product.categoryId,
        trackInventory: product.trackInventory,
        stockOnHand: String(product.stockOnHand),
        lowStockThreshold: product.lowStockThreshold != null ? String(product.lowStockThreshold) : "",
        isActive: product.isActive,
      });
    } else {
      setForm({
        ...DEFAULT_STATE,
        categoryId: defaultCategoryId ?? categories[0]?.id ?? "",
      });
    }
    setError(null);
    setSubmitting(false);
  }, [open, product, categories, defaultCategoryId]);

  const canSubmit = form.name.trim().length > 0 && form.categoryId && form.price.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const priceValue = Number(String(form.price).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(priceValue)) {
      setError("Price must be a number.");
      return;
    }

    const priceCents = dollarsToCents(form.price);
    const stock = Number(form.stockOnHand);
    const lowStock = form.lowStockThreshold.trim().length > 0 ? Number(form.lowStockThreshold) : null;

    if (!Number.isFinite(stock) || stock < 0) {
      setError("Stock on hand must be zero or more.");
      return;
    }

    if (lowStock !== null && (!Number.isFinite(lowStock) || lowStock < 0)) {
      setError("Low stock threshold must be zero or more.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: {
      categoryId?: string;
      name: string;
      priceCents: number;
      sku: string | null;
      barcode: string | null;
      trackInventory: boolean;
      stockOnHand: number;
      lowStockThreshold: number | null;
      isActive: boolean;
    } = {
      name: form.name.trim(),
      priceCents,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      trackInventory: form.trackInventory,
      stockOnHand: Math.floor(stock),
      lowStockThreshold: form.trackInventory && lowStock != null ? Math.floor(lowStock) : null,
      isActive: form.isActive,
    };

    if (mode === "create" || !product || form.categoryId !== product.categoryId) {
      payload.categoryId = form.categoryId;
    }

    try {
      const result = await runMutationWithToast(
        () =>
          mode === "edit" && product
            ? updateProduct({ id: product.id, ...payload })
            : createProduct({ ...payload, categoryId: form.categoryId }),
        {
          pending: { title: mode === "edit" ? "Saving product..." : "Creating product..." },
          success: { title: mode === "edit" ? "Product updated" : "Product created" },
          error: (message) => ({
            title: mode === "edit" ? "Unable to update product" : "Unable to create product",
            description: message,
          }),
          onSuccess: () => {
            onSaved();
            onOpenChange(false);
          },
          onError: (message) => setError(message),
        }
      );

      if (!result) return;
    } finally {
      setSubmitting(false);
    }
  };

  const inventoryDisabled = !form.trackInventory;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New product" : "Edit product"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-name">Name</Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. Swim cap"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-category">Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}
              >
                <SelectTrigger id="product-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-price">Price</Label>
              <Input
                id="product-price"
                inputMode="decimal"
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-sku">SKU</Label>
              <Input
                id="product-sku"
                value={form.sku}
                onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="product-barcode">Barcode</Label>
              <Input
                id="product-barcode"
                value={form.barcode}
                onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))}
                placeholder="Scanner-friendly" 
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Use the printed barcode value or scan to fill.</p>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Inventory tracking</p>
                <p className="text-xs text-muted-foreground">Disable if this product shouldn&apos;t affect stock.</p>
              </div>
              <Switch
                checked={form.trackInventory}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, trackInventory: checked }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-stock">Stock on hand</Label>
                <Input
                  id="product-stock"
                  type="number"
                  min={0}
                  value={form.stockOnHand}
                  onChange={(event) => setForm((prev) => ({ ...prev, stockOnHand: event.target.value }))}
                  disabled={inventoryDisabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-low-stock">Low stock threshold</Label>
                <Input
                  id="product-low-stock"
                  type="number"
                  min={0}
                  value={form.lowStockThreshold}
                  onChange={(event) => setForm((prev) => ({ ...prev, lowStockThreshold: event.target.value }))}
                  disabled={inventoryDisabled}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Active product</p>
              <p className="text-xs text-muted-foreground">Inactive products stay hidden on POS.</p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Saving..." : mode === "create" ? "Create product" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
