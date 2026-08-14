import { NextResponse } from "next/server";
import { queueScan } from "@/lib/queue";
import { getSessionUserId } from "@/lib/session";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const targets = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM target_repositories WHERE user_id = $1 AND selected = true", [userId]);
  if (!Number(targets.rows[0].count)) return NextResponse.json({ error: "请先在 GitHub 创建至少一个公开仓库，再点击“更新 Star”恢复监控。" }, { status: 422 });
  try {
    await queueScan(userId);
    return NextResponse.json({ queued: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue scan." }, { status: 503 });
  }
}
