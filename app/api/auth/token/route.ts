import { NextRequest, NextResponse } from "next/server";
import { getGithubUser, GitHubApiError } from "@/lib/github";
import { query } from "@/lib/db";
import { createSession, sessionCookie } from "@/lib/session";
import { storeCredential, tokenFor } from "@/lib/repository";
import { syncGithubAccount } from "@/lib/sync";
import { queueScan } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length < 20) return NextResponse.json({ error: "请输入有效的 GitHub Token。" }, { status: 400 });
  let githubUser;
  try {
    githubUser = await getGithubUser(token);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 401) return NextResponse.json({ error: "Token 无效或已过期。" }, { status: 401 });
    return NextResponse.json({ error: "GitHub 暂时无法验证 Token，请稍后重试。" }, { status: 502 });
  }
  try {
    const user = await query<{ id: string }>("INSERT INTO users (github_id, login, avatar_url) VALUES ($1, $2, $3) ON CONFLICT (github_id) DO UPDATE SET login = EXCLUDED.login, avatar_url = EXCLUDED.avatar_url, updated_at = now() RETURNING id", [githubUser.id, githubUser.login, githubUser.avatar_url]);
    const userId = user.rows[0].id;
    const policy = await query<{ interval_minutes: number; last_scan_at: Date | null }>("SELECT interval_minutes, last_scan_at FROM monitor_policies WHERE user_id = $1", [userId]);
    let sameToken = false;
    try { sameToken = (await tokenFor(userId)) === token; } catch { sameToken = false; }
    const previousPolicy = policy.rows[0];
    const scanWindowOpen = Boolean(previousPolicy?.last_scan_at && previousPolicy.last_scan_at.getTime() > Date.now() - (previousPolicy.interval_minutes * 60_000));
    const reuseCachedState = sameToken && scanWindowOpen;
    await storeCredential(userId, token, []);
    await query("INSERT INTO monitor_policies (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET enabled = true, updated_at = now()", [userId]);
    const cachedTargets = reuseCachedState ? await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM target_repositories WHERE user_id = $1 AND selected = true", [userId]) : null;
    const synced = reuseCachedState ? { starred: 0, targets: Number(cachedTargets?.rows[0]?.count ?? 0) } : await syncGithubAccount(userId, token);
    if (!synced.targets) {
      await query("UPDATE monitor_policies SET enabled = false, updated_at = now() WHERE user_id = $1", [userId]);
      const response = NextResponse.json({ ok: true, login: githubUser.login, ...synced, needsPublicTarget: true });
      response.cookies.set(sessionCookie(await createSession(userId)));
      return response;
    }
    if (!reuseCachedState) {
      await queueScan(userId);
      await query("UPDATE monitor_policies SET last_scan_at = now(), updated_at = now() WHERE user_id = $1", [userId]);
    }
    const response = NextResponse.json({ ok: true, login: githubUser.login, ...synced, scanQueued: !reuseCachedState, needsPublicTarget: false });
    response.cookies.set(sessionCookie(await createSession(userId)));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof GitHubApiError ? "Token 已验证，但当前权限不足以同步仓库。" : "Token 已验证，但首次同步或检测队列暂时不可用，请稍后重试。" }, { status: 503 });
  }
}
