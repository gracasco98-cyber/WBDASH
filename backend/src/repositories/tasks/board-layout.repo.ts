// board-layout.repo.ts — Repository layer for UserBoardLayout (bacheca).
// One row per user; the whole board is a single JSON blob of widget
// instances, not normalized into rows.
import type { PrismaClient } from "@prisma/client";

export interface BoardWidget {
  i: string; // instance id, unique within this user's layout
  type: string; // widget type key, resolved to a component on the frontend
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

export async function getBoardLayout(prisma: PrismaClient, userId: string): Promise<BoardWidget[] | null> {
  const row = await prisma.userBoardLayout.findUnique({ where: { userId } });
  return row ? (row.layout as unknown as BoardWidget[]) : null;
}

export async function saveBoardLayout(
  prisma: PrismaClient,
  params: { userId: string; layout: BoardWidget[] }
): Promise<void> {
  await prisma.userBoardLayout.upsert({
    where: { userId: params.userId },
    create: { userId: params.userId, layout: params.layout as object },
    update: { layout: params.layout as object },
  });
}
