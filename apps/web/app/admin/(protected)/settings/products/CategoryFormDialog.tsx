"use client";

import * as React from "react";
import type { ProductCategory } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createProductCategory } from "@/server/products/createProductCategory";
import { updateProductCategory } from "@/server/products/updateProductCategory";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: ProductCategory | null;
  onSaved: () => void;
}) {
  const mode: "create" | "edit" = category ? "edit" : "create";
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setError(null);
    setSubmitting(false);
  }, [open, category]);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await runMutationWithToast(
        () =>
          mode === "edit" && category
            ? updateProductCategory({ id: category.id, name: name.trim() })
            : createProductCategory({ name: name.trim() }),
        {
          pending: {
            title: mode === "edit" ? "Saving category..." : "Creating category...",
          },
          success: {
            title: mode === "edit" ? "Category updated" : "Category created",
          },
          error: (message) => ({
            title: mode === "edit" ? "Unable to update category" : "Unable to create category",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New category" : "Rename category"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Swimwear"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Saving..." : mode === "create" ? "Create category" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
