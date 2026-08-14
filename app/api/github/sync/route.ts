import { NextResponse } from "next/server";
import { tokenFor } from "@/lib/repository";
import { getSessionUserId } from "@/lib/session";
import { syncGithubAccount } from "@/lib/sync";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const synced = await syncGithubAccount(userId, await tokenFor(userId));
    if (!synced.targets) {
      await query("UPDATE monitor_policies SET enabled = false, updated_at = now() WHERE user_id = $1", [userId]);
      return NextResponse.json({ ...synced, needsPublicTarget: true });
    }
    await query("UPDATE monitor_policies SET enabled = true, updated_at = now() WHERE user_id = $1", [userId]);
    return NextResponse.json({ ...synced, needsPublicTarget: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed." }, { status: 502 });
  }
}
