import { NextResponse } from "next/server";
import { unstar } from "@/lib/github";
import { query } from "@/lib/db";
import { tokenFor } from "@/lib/repository";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const repo = await query<{ id: string; owner_login: string; name: string }>("SELECT id, owner_login, name FROM tracked_repositories WHERE id = $1 AND user_id = $2 AND unstarred_at IS NULL", [id, userId]);
  if (!repo.rowCount) return NextResponse.json({ error: "Tracked repository not found." }, { status: 404 });
  try {
    await unstar(repo.rows[0].owner_login, repo.rows[0].name, await tokenFor(userId));
    await query("UPDATE tracked_repositories SET unstarred_at = now(), updated_at = now() WHERE id = $1", [id]);
    await query("INSERT INTO unstar_actions (user_id, tracked_repository_id, mode, status) VALUES ($1, $2, 'MANUAL', 'SUCCESS')", [userId, id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unstar failed.";
    await query("INSERT INTO unstar_actions (user_id, tracked_repository_id, mode, status, error_message) VALUES ($1, $2, 'MANUAL', 'FAILED', $3)", [userId, id, message]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
