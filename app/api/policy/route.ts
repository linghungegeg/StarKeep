import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { intervalMinutes?: unknown } | null;
  const intervalMinutes = typeof body?.intervalMinutes === "number" ? body.intervalMinutes : NaN;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 360 || intervalMinutes > 10080) return NextResponse.json({ error: "检查间隔必须在 6 小时到 7 天之间。" }, { status: 400 });
  await query("UPDATE monitor_policies SET interval_minutes = $2, enabled = true, last_scan_at = now(), updated_at = now() WHERE user_id = $1", [userId, intervalMinutes]);
  return NextResponse.json({ ok: true });
}
