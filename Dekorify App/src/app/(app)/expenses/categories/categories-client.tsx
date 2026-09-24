"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2, AlertCircle } from "lucide-react";
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from "@/app/actions/expenses";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Badge, Swatch } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  CATEGORY_KINDS,
  CATEGORY_KIND_HELP,
  CATEGORY_KIND_LABELS,
  CHART_COLORS,
  type CategoryKind,
} from "@/lib/constants";

export interface CategoryRow {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string | null;
  sortOrder: number;
  isSystem: boolean;
  usageCount: number;
  totalFormatted: string;
}

const KIND_ORDER: CategoryKind[] = ["FULFILMENT", "OPERATING", "OTHER"];

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const confirm = useConfirm<CategoryRow>();
  const [, startTransition] = useTransition();

  // Local copy so reordering feels instant; the server call follows.
  const [order, setOrder] = useState(categories);
  useEffect(() => setOrder(categories), [categories]);

  function move(kind: CategoryKind, index: number, direction: -1 | 1) {
    const group = order.filter((category) => category.kind === kind);
    const target = index + direction;
    if (target < 0 || target >= group.length) return;

    const reordered = [...group];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    // Rebuild the whole list in visual order so sortOrder matches what is shown.
    const nextOrder = KIND_ORDER.flatMap((groupKind) =>
      groupKind === kind ? reordered : order.filter((category) => category.kind === groupKind),
    );
    setOrder(nextOrder);

    startTransition(async () => {
      const result = await reorderCategoriesAction(nextOrder.map((category) => category.id));
      if (!result.ok) {
        toast({ title: "Could not save the new order", variant: "error" });
        router.refresh();
      }
    });
  }

  async function handleDelete(category: CategoryRow) {
    const result = await deleteCategoryAction(category.id);
    toast({
      title: result.ok ? "Category deleted" : "Cannot delete this category",
      description: result.ok ? undefined : result.message,
      variant: result.ok ? "success" : "error",
    });
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New category
        </Button>
      </div>

      {KIND_ORDER.map((kind) => {
        const group = order.filter((category) => category.kind === kind);

        return (
          <section key={kind}>
            <div className="mb-2.5">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                {CATEGORY_KIND_LABELS[kind]}
              </h2>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                {CATEGORY_KIND_HELP[kind]}
              </p>
            </div>

            <div
              className="overflow-hidden rounded-xl border border-border-subtle bg-surface"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              {group.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-muted">
                  No categories in this group yet.
                </p>
              ) : (
                <ul>
                  {group.map((category, index) => (
                    <li
                      key={category.id}
                      className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0"
                    >
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => move(kind, index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${category.name} up`}
                          className="rounded p-0.5 text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(kind, index, 1)}
                          disabled={index === group.length - 1}
                          aria-label={`Move ${category.name} down`}
                          className="rounded p-0.5 text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>

                      <Swatch color={category.color ?? "#94a3b8"} className="h-3 w-3" />

                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[14px] font-medium text-foreground">
                          {category.name}
                          {category.isSystem && (
                            <span
                              title="Created with your store. It can be renamed but is used by the standard reports."
                              className="text-muted"
                            >
                              <Lock className="h-3 w-3" aria-hidden />
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted">
                          {category.usageCount === 0
                            ? "Not used yet"
                            : `${category.usageCount} expense${category.usageCount === 1 ? "" : "s"} · ${category.totalFormatted}`}
                        </p>
                      </div>

                      {category.usageCount > 0 && (
                        <Badge tone="neutral" className="hidden sm:inline-flex">
                          In use
                        </Badge>
                      )}

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditing(category)}
                          aria-label={`Edit ${category.name}`}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirm.ask(category)}
                          aria-label={`Delete ${category.name}`}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-negative-soft hover:text-negative"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      {adding && <CategoryDialog onClose={() => setAdding(false)} />}
      {editing && <CategoryDialog category={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={async () => {
          if (confirm.target) await handleDelete(confirm.target);
        }}
        title="Delete this category?"
        message={
          confirm.target?.usageCount
            ? `"${confirm.target.name}" is used by ${confirm.target.usageCount} expense${confirm.target.usageCount === 1 ? "" : "s"}. Move those to another category first.`
            : `"${confirm.target?.name}" will be removed. This cannot be undone.`
        }
      />
    </div>
  );
}

function CategoryDialog({
  category,
  onClose,
}: {
  category?: CategoryRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(category);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateCategoryAction : createCategoryAction,
    null,
  );
  const [color, setColor] = useState(category?.color ?? CHART_COLORS[0]);

  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Saved" });
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit category" : "New expense category"}
      description="Where a category sits decides where its expenses appear in the profit & loss statement."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={pending}>
            {isEdit ? "Save changes" : "Create category"}
          </Button>
        </>
      }
    >
      <form id="category-form" action={formAction} className="space-y-4">
        {category && <input type="hidden" name="id" value={category.id} />}
        <input type="hidden" name="color" value={color} />

        {state?.message && !state.ok && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-negative-border bg-negative-soft p-3"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-negative" aria-hidden />
            <p className="text-[13px] leading-snug text-negative">{state.message}</p>
          </div>
        )}

        <Input
          name="name"
          label="Category name"
          placeholder="Freight & duty"
          required
          defaultValue={category?.name}
          error={state?.errors?.name}
        />

        <Select
          name="kind"
          label="Where it belongs"
          defaultValue={category?.kind ?? CATEGORY_KINDS.OPERATING}
          error={state?.errors?.kind}
          hint={CATEGORY_KIND_HELP[category?.kind ?? "OPERATING"]}
          options={KIND_ORDER.map((kind) => ({
            value: kind,
            label: CATEGORY_KIND_LABELS[kind],
          }))}
        />

        <Field label="Colour" hint="Used in charts and beside the category name.">
          <div className="flex flex-wrap gap-2">
            {CHART_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-label={`Use colour ${option}`}
                aria-pressed={color === option}
                className={
                  color === option
                    ? "h-7 w-7 rounded-lg ring-2 ring-brand ring-offset-2"
                    : "h-7 w-7 rounded-lg transition-transform hover:scale-110"
                }
                style={{ backgroundColor: option }}
              />
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
