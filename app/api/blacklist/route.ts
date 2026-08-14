import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;
  try {
    const [entries, count] = await Promise.all([
      query<{ id: string; owner_login: string; last_detected_at: Date }>("SELECT id, owner_login, last_detected_at FROM blacklist_entries ORDER BY last_detected_at DESC LIMIT $1 OFFSET $2", [PAGE_SIZE, offset]),
      query<{ total: string }>("SELECT COUNT(*)::text AS total FROM blacklist_entries")
    ]);
    return NextResponse.json({ page, pageSize: PAGE_SIZE, total: Number(count.rows[0].total), entries: entries.rows.map((entry) => ({ id: entry.id, ownerLogin: entry.owner_login, detectedAt: entry.last_detected_at.toISOString() })) });
  } catch (error) {
    console.error("Unable to load blacklist", error);
    return NextResponse.json({ page, pageSize: PAGE_SIZE, total: 0, entries: [] });
  }
}
