"use client";

import * as React from "react";
import type { Product, ProductCategory } from "@prisma/client";
import { ArrowDown, ArrowUp, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrencyFromCents } from "@/lib/currency";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

import { reorderProductCategories } from "@/server/products/reorderProductCategories";
import { updateProductCategory } from "@/server/products/updateProductCategory";
import { reorderProducts } from "@/server/products/reorderProducts";
import { updateProductStock } from "@/server/products/updateProductStock";
import { stocktakeProducts } from "@/server/products/stocktakeProducts";

import { CategoryFormDialog } from "./CategoryFormDialog";
import { ProductFormDialog } from "./ProductFormDialog";

type CategoryWithProducts = ProductCategory & { products: Product[] };

type StockEditorState = {
  id: string;
  value: string;
};

export function ProductsSection({ categories }: { categories: CategoryWithProducts[] }) {
  const router = useRouter();
  const [localCategories, setLocalCategories] = React.useState<CategoryWithProducts[]>(categories);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(categories[0]?.id ?? null);
  const [search, setSearch] = React.useState("");
  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<ProductCategory | null>(null);
  const [productDialogOpen, setProductDialogOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [stockEditor, setStockEditor] = React.useState<StockEditorState | null>(null);
  const [stocktakeMode, setStocktakeMode] = React.useState(false);
  const [stocktakeCounts, setStocktakeCounts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  React.useEffect(() => {
    if (!selectedCategoryId) {
      setSelectedCategoryId(localCategories[0]?.id ?? null);
      return;
    }
    if (!localCategories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(localCategories[0]?.id ?? null);
    }
  }, [localCategories, selectedCategoryId]);

  React.useEffect(() => {
    if (!stocktakeMode) return;
    const category = localCategories.find((item) => item.id === selectedCategoryId);
    if (!category) return;
    setStocktakeCounts(
      Object.fromEntries(category.products.map((product) => [product.id, String(product.stockOnHand)]))
    );
  }, [stocktakeMode, selectedCategoryId]);

  const selectedCategory = localCategories.find((category) => category.id === selectedCategoryId) ?? null;

  const filteredProducts = React.useMemo(() => {
    if (!selectedCategory) return [];
    const query = search.trim().toLowerCase();
    if (!query) return selectedCategory.products;
    return selectedCategory.products.filter((product) => {
      return (
        product.name.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query) ||
        product.barcode?.toLowerCase().includes(query)
      );
    });
  }, [selectedCategory, search]);

  const reorderDisabled = search.trim().length > 0;

  const updateLocalProduct = React.useCallback(
    (productId: string, updater: (product: Product) => Product) => {
      setLocalCategories((prev) =>
        prev.map((category) => ({
          ...category,
          products: category.products.map((product) =>
            product.id === productId ? updater(product) : product
          ),
        }))
      );
    },
    []
  );

  const handleReorderCategories = async (next: CategoryWithProducts[]) => {
    const previous = localCategories;
    setLocalCategories(next);

    await runMutationWithToast(
      () => reorderProductCategories({ orderedIds: next.map((category) => category.id) }),
      {
        pending: { title: "Reordering categories..." },
        success: { title: "Category order updated" },
        error: (message) => ({
          title: "Unable to reorder categories",
          description: message,
        }),
        onSuccess: () => router.refresh(),
        onError: () => setLocalCategories(previous),
      }
    );
  };

  const handleMoveCategory = (categoryId: string, direction: "up" | "down") => {
    const index = localCategories.findIndex((category) => category.id === categoryId);
    if (index < 0) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= localCategories.length) return;
    const next = [...localCategories];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    handleReorderCategories(next);
  };

  const handleMoveProduct = (productId: string, direction: "up" | "down") => {
    if (reorderDisabled) return;
    if (!selectedCategory) return;
    const products = selectedCategory.products;
    const index = products.findIndex((product) => product.id === productId);
    if (index < 0) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= products.length) return;

    const nextProducts = [...products];
    const [moved] = nextProducts.splice(index, 1);
    nextProducts.splice(nextIndex, 0, moved);

    const nextCategories = localCategories.map((category) =>
      category.id === selectedCategory.id ? { ...category, products: nextProducts } : category
    );

    setLocalCategories(nextCategories);

    runMutationWithToast(
      () => reorderProducts({ categoryId: selectedCategory.id, orderedIds: nextProducts.map((p) => p.id) }),
      {
        pending: { title: "Reordering products..." },
        success: { title: "Product order updated" },
        error: (message) => ({
          title: "Unable to reorder products",
          description: message,
        }),
        onSuccess: () => router.refresh(),
        onError: () => setLocalCategories(localCategories),
      }
    );
  };

  const handleToggleCategory = async (category: ProductCategory, nextActive: boolean) => {
    const previous = localCategories;
    setLocalCategories((prev) =>
      prev.map((item) => (item.id === category.id ? { ...item, isActive: nextActive } : item))
    );

    await runMutationWithToast(
      () => updateProductCategory({ id: category.id, isActive: nextActive }),
      {
        pending: { title: "Updating category..." },
        success: { title: "Category updated" },
        error: (message) => ({
          title: "Unable to update category",
          description: message,
        }),
        onSuccess: () => router.refresh(),
        onError: () => setLocalCategories(previous),
      }
    );
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    if (!product.trackInventory) {
      toast.error("Inventory tracking is disabled for this product.");
      return;
    }

    const safeDelta = Math.max(-product.stockOnHand, delta);
    if (safeDelta === 0) return;
    const nextStock = product.stockOnHand + safeDelta;
    const previous = product.stockOnHand;

    updateLocalProduct(product.id, (current) => ({ ...current, stockOnHand: nextStock }));

    await runMutationWithToast(
      () => updateProductStock({ productId: product.id, mode: "adjust", quantity: safeDelta }),
      {
        pending: { title: "Updating stock..." },
        success: { title: "Stock updated" },
        error: (message) => ({
          title: "Unable to update stock",
          description: message,
        }),
        onSuccess: () => router.refresh(),
        onError: () => updateLocalProduct(product.id, (current) => ({ ...current, stockOnHand: previous })),
      }
    );
  };

  const handleSetStock = async (product: Product, nextValue: number) => {
    if (nextValue < 0 || !Number.isFinite(nextValue)) {
      toast.error("Stock count must be zero or more.");
      return;
    }

    const previous = product.stockOnHand;
    updateLocalProduct(product.id, (current) => ({ ...current, stockOnHand: nextValue }));

    await runMutationWithToast(
      () => updateProductStock({ productId: product.id, mode: "set", quantity: nextValue }),
      {
        pending: { title: "Setting stock..." },
        success: { title: "Stock set" },
        error: (message) => ({
          title: "Unable to set stock",
          description: message,
        }),
        onSuccess: () => router.refresh(),
        onError: () => updateLocalProduct(product.id, (current) => ({ ...current, stockOnHand: previous })),
      }
    );
  };

  const handleSaveStocktake = async () => {
    if (!selectedCategory) return;

    const updates: Array<{ productId: string; count: number }> = [];

    for (const product of selectedCategory.products) {
      const raw = stocktakeCounts[product.id];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error(`Invalid count for ${product.name}.`);
        return;
      }
      const count = Math.floor(parsed);
      if (count !== product.stockOnHand) {
        updates.push({ productId: product.id, count });
      }
    }

    if (updates.length === 0) {
      toast("No stock changes to save.");
      return;
    }

    const previous = localCategories;
    setLocalCategories((prev) =>
      prev.map((category) =>
        category.id === selectedCategory.id
          ? {
              ...category,
              products: category.products.map((product) => {
                const update = updates.find((item) => item.productId === product.id);
                return update ? { ...product, stockOnHand: update.count } : product;
              }),
            }
          : category
      )
    );

    await runMutationWithToast(
      () => stocktakeProducts({ items: updates }),
      {
        pending: { title: "Saving stocktake..." },
        success: { title: "Stocktake saved" },
        error: (message) => ({
          title: "Unable to save stocktake",
          description: message,
        }),
        onSuccess: () => {
          router.refresh();
          setStocktakeMode(false);
        },
        onError: () => setLocalCategories(previous),
      }
    );
  };

  const hasCategories = localCategories.length > 0;

  return (
    <div className="">
      <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Products</h2>
          <p className="text-sm text-muted-foreground">Organise categories, prices, and inventory.</p>
        </div>
      </div>

      <div className="grid gap-4 px-4 pb-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-l-0! shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Categories</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setEditingCategory(null);
                setCategoryDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {!hasCategories ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Create your first category to start adding products.
              </div>
            ) : (
              localCategories.map((category, index) => {
                const isSelected = category.id === selectedCategoryId;
                return (
                  <div
                    key={category.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2",
                      isSelected ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(category.id)}
                      className="flex flex-1 flex-col items-start gap-1 text-left"
                    >
                      <span className="text-sm font-medium">{category.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {category.products.length} products
                      </span>
                    </button>

                    <div className="ml-2 flex items-center gap-1">
                      {!category.isActive ? (
                        <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                      ) : null}
                      <Switch
                        checked={category.isActive}
                        onCheckedChange={(checked) => handleToggleCategory(category, checked)}
                        aria-label={`Toggle ${category.name}`}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingCategory(category);
                          setCategoryDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleMoveCategory(category.id, "up");
                          }}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleMoveCategory(category.id, "down");
                          }}
                          disabled={index === localCategories.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="border-l-0! shadow-none">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                {selectedCategory ? selectedCategory.name : "Products"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {selectedCategory ? `${selectedCategory.products.length} total` : "Select a category to begin."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={stocktakeMode}
                  onCheckedChange={(checked) => setStocktakeMode(checked)}
                  id="stocktake-mode"
                  disabled={!selectedCategory}
                />
                <Label htmlFor="stocktake-mode" className="text-sm">
                  Stocktake
                </Label>
              </div>
              {!stocktakeMode ? (
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search products"
                    className="pl-8 w-[200px]"
                    disabled={!selectedCategory}
                  />
                </div>
              ) : null}
              <Button
                size="sm"
                onClick={() => {
                  setEditingProduct(null);
                  setProductDialogOpen(true);
                }}
                disabled={!selectedCategory}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add product
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedCategory ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Choose a category to manage products.
              </div>
            ) : selectedCategory.products.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No products yet. Add your first product to get started.
              </div>
            ) : stocktakeMode ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Enter the counted stock for each product.
                  </p>
                  <Button size="sm" onClick={handleSaveStocktake}>
                    Save counts
                  </Button>
                </div>

                <div className="space-y-2">
                  {selectedCategory.products.map((product) => {
                    const raw = stocktakeCounts[product.id] ?? "";
                    const parsed = Number(raw);
                    const valid = Number.isFinite(parsed) && parsed >= 0;
                    const nextValue = valid ? Math.floor(parsed) : null;
                    const changed = valid && nextValue !== product.stockOnHand;

                    return (
                      <div
                        key={product.id}
                        className={cn(
                          "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
                          changed ? "bg-muted/40" : ""
                        )}
                      >
                        <div>
                          <p className="text-sm font-semibold">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {changed
                              ? `Was ${product.stockOnHand} -> Now ${nextValue ?? "--"}`
                              : `Current ${product.stockOnHand}`}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          className={cn("w-28", !valid ? "border-destructive" : "")}
                          value={raw}
                          onChange={(event) =>
                            setStocktakeCounts((prev) => ({
                              ...prev,
                              [product.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProducts.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No products match your search.
                  </div>
                ) : (
                  filteredProducts.map((product, index) => {
                    const lowStock =
                      product.trackInventory &&
                      product.lowStockThreshold != null &&
                      product.stockOnHand <= product.lowStockThreshold;
                    const isEditingStock = stockEditor?.id === product.id;

                    return (
                      <div key={product.id} className="rounded-lg border p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.sku ? `SKU ${product.sku}` : product.barcode ? `Barcode ${product.barcode}` : "No SKU or barcode"}
                            </div>
                          </div>
                          <div className="text-sm font-semibold">
                            {formatCurrencyFromCents(product.priceCents)}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {!product.isActive ? (
                            <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                          ) : null}
                          {product.trackInventory ? (
                            <span>Stock {product.stockOnHand}</span>
                          ) : (
                            <span>Inventory off</span>
                          )}
                          {lowStock ? <Badge variant="destructive" className="text-[10px]">Low stock</Badge> : null}
                        </div>

                        <Separator className="my-3" />

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            {product.trackInventory ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleAdjustStock(product, -5)}
                                >
                                  -5
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleAdjustStock(product, -1)}
                                >
                                  -1
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleAdjustStock(product, 1)}
                                >
                                  +1
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleAdjustStock(product, 5)}
                                >
                                  +5
                                </Button>

                                {isEditingStock ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min={0}
                                      className="h-7 w-24"
                                      value={stockEditor.value}
                                      onChange={(event) =>
                                        setStockEditor({ id: product.id, value: event.target.value })
                                      }
                                    />
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => {
                                        const parsed = Number(stockEditor.value);
                                        if (!Number.isFinite(parsed)) {
                                          toast.error("Enter a valid number.");
                                          return;
                                        }
                                        handleSetStock(product, Math.floor(parsed));
                                        setStockEditor(null);
                                      }}
                                    >
                                      Set
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => setStockEditor(null)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() =>
                                      setStockEditor({ id: product.id, value: String(product.stockOnHand) })
                                    }
                                  >
                                    Set stock
                                  </Button>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Inventory not tracked.</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingProduct(product);
                                setProductDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <div className="flex flex-col">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleMoveProduct(product.id, "up")}
                                disabled={reorderDisabled || index === 0}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleMoveProduct(product.id, "down")}
                                disabled={reorderDisabled || index === filteredProducts.length - 1}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CategoryFormDialog
        open={categoryDialogOpen}
        category={editingCategory}
        onOpenChange={(open) => {
          setCategoryDialogOpen(open);
          if (!open) setEditingCategory(null);
        }}
        onSaved={() => router.refresh()}
      />

      <ProductFormDialog
        open={productDialogOpen}
        product={editingProduct}
        categories={localCategories}
        defaultCategoryId={selectedCategoryId}
        onOpenChange={(open) => {
          setProductDialogOpen(open);
          if (!open) setEditingProduct(null);
        }}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
