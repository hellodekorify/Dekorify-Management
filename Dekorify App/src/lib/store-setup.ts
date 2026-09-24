import { prisma } from "./db";
import { DEFAULT_EXPENSE_CATEGORIES } from "./constants";
import { startOfYear } from "date-fns";

/**
 * Everything a brand-new store needs before it is usable: the membership
 * record, the standard chart of expense categories and a default cash account
 * so the cash-flow statement has an opening balance to work from.
 */
export async function createStoreForUser(
  userId: string,
  input: { name: string; baseCurrency?: string; timezone?: string },
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        name: input.name.trim(),
        baseCurrency: input.baseCurrency ?? "PKR",
        timezone: input.timezone ?? "Asia/Karachi",
        members: { create: { userId, role: "OWNER" } },
      },
    });

    await tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((category, index) => ({
        storeId: store.id,
        name: category.name,
        kind: category.kind,
        color: category.color,
        sortOrder: index,
        isSystem: true,
      })),
    });

    await tx.cashAccount.create({
      data: {
        storeId: store.id,
        name: "Main account",
        type: "BANK",
        currency: store.baseCurrency,
        openingBalanceMinor: 0n,
        openingDate: startOfYear(new Date()),
        isDefault: true,
      },
    });

    return store.id;
  });
}
