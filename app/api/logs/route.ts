import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";

const PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const [runs, count] = await Promise.all([
    query<{ id: string; status: "RUNNING" | "COMPLETED" | "FAILED"; checked_count: number; mutual_count: number; not_mutual_count: number; unmatched_count: number; auto_unstar_count: number; unknown_count: number; error_message: string | null; started_at: Date; finished_at: Date | null }>("SELECT id, status, checked_count, mutual_count, not_mutual_count, unmatched_count, auto_unstar_count, unknown_count, error_message, started_at, finished_at FROM scan_runs WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3", [userId, PAGE_SIZE, offset]),
    query<{ total: string }>("SELECT COUNT(*)::text AS total FROM scan_runs WHERE user_id = $1", [userId])
  ]);
  return NextResponse.json({ page, pageSize: PAGE_SIZE, total: Number(count.rows[0].total), runs: runs.rows.map((run) => ({ id: run.id, status: run.status, checkedCount: run.checked_count, mutualCount: run.mutual_count, changedCount: run.not_mutual_count, unmatchedCount: run.unmatched_count, autoUnstarCount: run.auto_unstar_count, unknownCount: run.unknown_count, errorMessage: run.error_message, startedAt: run.started_at.toISOString(), finishedAt: run.finished_at?.toISOString() ?? null })) });
}
