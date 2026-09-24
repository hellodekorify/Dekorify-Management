import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentStore, getCurrentUser } from "@/lib/auth";
import { contentTypeFor, readStoredFile } from "@/lib/storage";

/**
 * Serves an expense's receipt. The file is looked up through the expense, and
 * the expense is scoped to the signed-in user's store, so one account can never
 * read another's attachments.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ expenseId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });

  const store = await getCurrentStore(user.id);
  if (!store) return new NextResponse("No store selected", { status: 403 });

  const { expenseId } = await params;

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, storeId: store.id },
    select: { receiptPath: true, receiptFileName: true },
  });

  if (!expense?.receiptPath) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await readStoredFile(expense.receiptPath);
    const fileName = expense.receiptFileName ?? "receipt";

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentTypeFor(fileName),
        // `inline` lets a PDF or image open in the browser rather than download.
        "Content-Disposition": `inline; filename="${fileName.replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("The receipt file is missing from storage.", { status: 410 });
  }
}
