import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { queueReciprocalOrder } from "@/lib/queue";
import { star } from "@/lib/github";
import { tokenFor } from "@/lib/repository";

export const runtime = "nodejs";

const PAGE_SIZE = 20;
const PUBLIC_CACHE = "public, s-maxage=1, stale-while-revalidate=5";
const PRIVATE_CACHE = "private, no-store";

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  const requestedGalleryPage = Number(request.nextUrl.searchParams.get("galleryPage") ?? "1");
  const requestedOrdersPage = Number(request.nextUrl.searchParams.get("ordersPage") ?? "1");
  const galleryPage = Number.isInteger(requestedGalleryPage) && requestedGalleryPage > 0 ? requestedGalleryPage : 1;
  const ordersPage = Number.isInteger(requestedOrdersPage) && requestedOrdersPage > 0 ? requestedOrdersPage : 1;
  const headers = { "Cache-Control": userId ? PRIVATE_CACHE : PUBLIC_CACHE };
  try {
    const [publicRepos, publicCount, ownRepos, orders, ordersCount] = await Promise.all([
    query<{ id: string; full_name: string; html_url: string; login: string; is_default: boolean; user_id: string }>("SELECT m.id, m.full_name, m.html_url, u.login, m.is_default, m.user_id FROM managed_repositories m JOIN users u ON u.id = m.user_id WHERE m.enabled = true ORDER BY m.updated_at DESC LIMIT $1 OFFSET $2", [PAGE_SIZE, (galleryPage - 1) * PAGE_SIZE]),
    query<{ total: string }>("SELECT COUNT(*)::text AS total FROM managed_repositories WHERE enabled = true"),
    userId ? query<{ id: string; target_repository_id: string; full_name: string; html_url: string; is_default: boolean }>("SELECT m.id, t.id AS target_repository_id, m.full_name, m.html_url, m.is_default FROM managed_repositories m JOIN target_repositories t ON t.user_id = m.user_id AND t.github_repo_id = m.github_repo_id WHERE m.user_id = $1 AND m.enabled = true ORDER BY m.is_default DESC, m.full_name", [userId]) : Promise.resolve({ rows: [] } as { rows: { id: string; target_repository_id: string; full_name: string; html_url: string; is_default: boolean }[] }),
    userId ? query<{ id: string; source_full_name: string; requester_full_name: string; status: string; last_error: string | null; created_at: Date }>("SELECT o.id, s.full_name AS source_full_name, r.full_name AS requester_full_name, o.status, o.last_error, o.created_at FROM reciprocal_orders o JOIN managed_repositories s ON s.id = o.source_managed_repository_id JOIN managed_repositories r ON r.id = o.requester_repository_id WHERE o.requester_user_id = $1 OR o.owner_user_id = $1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3", [userId, PAGE_SIZE, (ordersPage - 1) * PAGE_SIZE]) : Promise.resolve({ rows: [] } as { rows: { id: string; source_full_name: string; requester_full_name: string; status: string; last_error: string | null; created_at: Date }[] }),
    userId ? query<{ total: string }>("SELECT COUNT(*)::text AS total FROM reciprocal_orders WHERE requester_user_id = $1 OR owner_user_id = $1", [userId]) : Promise.resolve({ rows: [{ total: "0" }] } as { rows: { total: string }[] })
    ]);
    return NextResponse.json({ galleryPage, ordersPage, pageSize: PAGE_SIZE, publicTotal: Number(publicCount.rows[0].total), ordersTotal: Number(ordersCount.rows[0].total), publicRepos: publicRepos.rows.map((repo) => ({ id: repo.id, fullName: repo.full_name, htmlUrl: repo.html_url, ownerLogin: repo.login, isDefault: repo.is_default, isMine: repo.user_id === userId })), ownRepos: ownRepos.rows.map((repo) => ({ id: repo.id, targetRepositoryId: repo.target_repository_id, fullName: repo.full_name, htmlUrl: repo.html_url, isDefault: repo.is_default })), orders: orders.rows.map((order) => ({ id: order.id, sourceFullName: order.source_full_name, requesterFullName: order.requester_full_name, status: order.status, lastError: order.last_error, createdAt: order.created_at.toISOString() })) }, { headers });
  } catch (error) {
    console.error("Unable to load reciprocal gallery", error);
    return NextResponse.json({ galleryPage, ordersPage, pageSize: PAGE_SIZE, publicTotal: 0, ordersTotal: 0, publicRepos: [], ownRepos: [], orders: [] }, { headers });
  }
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { repositoryIds?: unknown; defaultRepositoryId?: unknown } | null;
  const ids = Array.isArray(body?.repositoryIds) ? body.repositoryIds.filter((id): id is string => typeof id === "string") : [];
  const defaultId = typeof body?.defaultRepositoryId === "string" ? body.defaultRepositoryId : null;
  if (defaultId && !ids.includes(defaultId)) return NextResponse.json({ error: "默认回赞仓库必须包含在托管仓库中。" }, { status: 400 });
  const targets = await query<{ id: string; github_repo_id: string; full_name: string; owner_login: string; name: string; html_url: string }>("SELECT id, github_repo_id, full_name, owner_login, name, html_url FROM target_repositories WHERE user_id = $1 AND id = ANY($2::uuid[]) AND selected = true", [userId, ids]);
  if (targets.rowCount !== ids.length) return NextResponse.json({ error: "只能托管自己已同步的公开仓库。" }, { status: 400 });
  await query("UPDATE managed_repositories SET enabled = false, is_default = false, updated_at = now() WHERE user_id = $1", [userId]);
  for (const target of targets.rows) await query("INSERT INTO managed_repositories (user_id, github_repo_id, full_name, owner_login, name, html_url, is_default, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, true) ON CONFLICT (user_id, github_repo_id) DO UPDATE SET full_name = EXCLUDED.full_name, owner_login = EXCLUDED.owner_login, name = EXCLUDED.name, html_url = EXCLUDED.html_url, is_default = EXCLUDED.is_default, enabled = true, updated_at = now()", [userId, target.github_repo_id, target.full_name, target.owner_login, target.name, target.html_url, target.id === defaultId]);
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "请先填写 GitHub Token。" }, { status: 401 });
  const body = await request.json().catch(() => null) as { managedRepositoryId?: unknown } | null;
  const managedId = typeof body?.managedRepositoryId === "string" ? body.managedRepositoryId : "";
  const source = await query<{ id: string; user_id: string; owner_login: string; name: string; full_name: string }>("SELECT id, user_id, owner_login, name, full_name FROM managed_repositories WHERE id = $1 AND enabled = true", [managedId]);
  if (!source.rowCount) return NextResponse.json({ error: "托管仓库不存在或已暂停。" }, { status: 404 });
  if (source.rows[0].user_id === userId) return NextResponse.json({ error: "不能给自己的托管仓库创建互赞。" }, { status: 400 });
  const target = await query<{ id: string; owner_login: string; name: string }>("SELECT id, owner_login, name FROM managed_repositories WHERE user_id = $1 AND enabled = true AND is_default = true", [userId]);
  if (!target.rowCount) return NextResponse.json({ error: "请先设置一个默认回赞仓库。" }, { status: 422 });
  const existing = await query<{ id: string; status: string }>("SELECT id, status FROM reciprocal_orders WHERE requester_user_id = $1 AND source_managed_repository_id = $2", [userId, managedId]);
  if (existing.rowCount && existing.rows[0].status !== "FAILED") return NextResponse.json({ ok: true, duplicate: true, status: existing.rows[0].status });
  try {
    await star(source.rows[0].owner_login, source.rows[0].name, await tokenFor(userId));
    const order = await query<{ id: string }>("INSERT INTO reciprocal_orders (requester_user_id, owner_user_id, source_managed_repository_id, requester_repository_id, status) VALUES ($1, $2, $3, $4, 'OWNER_PENDING') ON CONFLICT (requester_user_id, source_managed_repository_id) DO UPDATE SET requester_repository_id = EXCLUDED.requester_repository_id, status = 'OWNER_PENDING', last_error = NULL, requester_starred_at = now(), updated_at = now() RETURNING id", [userId, source.rows[0].user_id, managedId, target.rows[0].id]);
    await queueReciprocalOrder(order.rows[0].id);
    return NextResponse.json({ ok: true, status: "OWNER_PENDING", source: source.rows[0].full_name, target: target.rows[0].owner_login + "/" + target.rows[0].name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 500) : "Star failed." }, { status: 502 });
  }
}
