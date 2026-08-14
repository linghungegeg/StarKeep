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
  const [stars, count, user] = await Promise.all([
    query<{ id: string; full_name: string; html_url: string; starred_at: Date | null }>("SELECT id, full_name, html_url, starred_at FROM tracked_repositories WHERE user_id = $1 AND unstarred_at IS NULL ORDER BY starred_at DESC NULLS LAST, updated_at DESC LIMIT $2 OFFSET $3", [userId, PAGE_SIZE, offset]),
    query<{ total: string }>("SELECT COUNT(*)::text AS total FROM tracked_repositories WHERE user_id = $1 AND unstarred_at IS NULL", [userId]),
    query<{ login: string }>("SELECT login FROM users WHERE id = $1", [userId])
  ]);

  return NextResponse.json({ page, pageSize: PAGE_SIZE, total: Number(count.rows[0].total), stars: stars.rows.map((star) => ({ id: star.id, fullName: star.full_name, htmlUrl: star.html_url, starredBy: user.rows[0]?.login ?? "", starredAt: star.starred_at?.toISOString() ?? null })) });
}
