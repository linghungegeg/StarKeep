import { decrypt, encrypt } from "./crypto";
import { query } from "./db";

export type DashboardRow = { id: string; fullName: string; ownerLogin: string; htmlUrl: string; status: "MUTUAL" | "NOT_MUTUAL" | "UNKNOWN"; everMutual: boolean; failures: number; lastCheckedAt: string | null; whitelisted: boolean; enabled: boolean; unstarredAt: string | null; };

export async function tokenFor(userId: string) {
  const result = await query<{ encrypted_access_token: string; token_iv: string; token_tag: string }>("SELECT encrypted_access_token, token_iv, token_tag FROM github_credentials WHERE user_id = $1", [userId]);
  if (!result.rowCount) throw new Error("GitHub authorization is missing.");
  const credential = result.rows[0];
  return decrypt({ encrypted: credential.encrypted_access_token, iv: credential.token_iv, tag: credential.token_tag });
}

export async function storeCredential(userId: string, accessToken: string, scopes: string[]) {
  const encrypted = encrypt(accessToken);
  await query("INSERT INTO github_credentials (user_id, encrypted_access_token, token_iv, token_tag, scopes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET encrypted_access_token = EXCLUDED.encrypted_access_token, token_iv = EXCLUDED.token_iv, token_tag = EXCLUDED.token_tag, scopes = EXCLUDED.scopes, invalidated_at = NULL, updated_at = now()", [userId, encrypted.encrypted, encrypted.iv, encrypted.tag, scopes]);
}

export async function invalidateCredential(userId: string) {
  await query("UPDATE github_credentials SET invalidated_at = now(), updated_at = now() WHERE user_id = $1", [userId]);
}

type GlobalStats = { monitored: number; mutual: number; reports_sent: number; failed: number; processed: number; blacklisted: number };

async function globalStats() {
  try {
    const result = await query<GlobalStats>("SELECT (SELECT COUNT(*)::int FROM tracked_repositories WHERE enabled = true AND unstarred_at IS NULL) AS monitored, (SELECT COUNT(*)::int FROM tracked_repositories WHERE relationship_status = 'MUTUAL' AND enabled = true AND unstarred_at IS NULL) AS mutual, (SELECT COUNT(*)::int FROM email_report_deliveries WHERE status = 'SENT') AS reports_sent, (SELECT COUNT(*)::int FROM tracked_repositories WHERE relationship_status = 'NOT_MUTUAL' AND ever_mutual = true AND enabled = true) AS failed, (SELECT COUNT(*)::int FROM unstar_actions WHERE status = 'SUCCESS') AS processed, (SELECT COUNT(*)::int FROM blacklist_entries) AS blacklisted");
    return result.rows[0] ?? { monitored: 0, mutual: 0, reports_sent: 0, failed: 0, processed: 0, blacklisted: 0 };
  } catch (error) {
    console.error("Unable to load global dashboard statistics", error);
    return { monitored: 0, mutual: 0, reports_sent: 0, failed: 0, processed: 0, blacklisted: 0 };
  }
}

export async function dashboard(userId: string | null, requestedPage = 1) {
  const pageSize = 20;
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * pageSize;
  const totals = await globalStats();
  const stats = { monitored: totals.monitored, mutual: totals.mutual, reportsSent: totals.reports_sent, failed: totals.failed, processed: totals.processed, blacklisted: totals.blacklisted };
  if (!userId) return { user: null, stats };

  const [user, policy, tracked, trackedCount, targets, credentials, report] = await Promise.all([
    query<{ login: string; avatar_url: string | null }>("SELECT login, avatar_url FROM users WHERE id = $1", [userId]),
    query<{ enabled: boolean; interval_minutes: number; last_scan_at: Date | null }>("SELECT enabled, interval_minutes, last_scan_at FROM monitor_policies WHERE user_id = $1", [userId]),
    query<{ id: string; full_name: string; owner_login: string; html_url: string; relationship_status: DashboardRow["status"]; ever_mutual: boolean; consecutive_not_mutual: number; last_checked_at: Date | null; whitelisted: boolean; enabled: boolean; unstarred_at: Date | null }>("SELECT id, full_name, owner_login, html_url, relationship_status, ever_mutual, consecutive_not_mutual, last_checked_at, whitelisted, enabled, unstarred_at FROM tracked_repositories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3", [userId, pageSize, offset]),
    query<{ total: string }>("SELECT COUNT(*)::text AS total FROM tracked_repositories WHERE user_id = $1", [userId]),
    query<{ id: string; full_name: string; selected: boolean }>("SELECT id, full_name, selected FROM target_repositories WHERE user_id = $1 ORDER BY full_name", [userId]),
    query<{ invalidated_at: Date | null }>("SELECT invalidated_at FROM github_credentials WHERE user_id = $1", [userId]),
    query<{ email: string; interval_minutes: number; verified_at: Date | null; last_sent_at: Date | null }>("SELECT email, interval_minutes, verified_at, last_sent_at FROM email_subscriptions WHERE user_id = $1", [userId])
  ]);
  const records: DashboardRow[] = tracked.rows.map((row) => ({ id: row.id, fullName: row.full_name, ownerLogin: row.owner_login, htmlUrl: row.html_url, status: row.relationship_status, everMutual: row.ever_mutual, failures: row.consecutive_not_mutual, lastCheckedAt: row.last_checked_at?.toISOString() ?? null, whitelisted: row.whitelisted, enabled: row.enabled, unstarredAt: row.unstarred_at?.toISOString() ?? null }));
  const subscription = report.rows[0];
  return { user: user.rows[0] ? { login: user.rows[0].login, avatarUrl: user.rows[0].avatar_url } : null, tokenInvalidated: credentials.rows[0]?.invalidated_at?.toISOString() ?? null, policy: policy.rows[0] ?? null, records, recordsPage: page, recordsPageSize: pageSize, recordsTotal: Number(trackedCount.rows[0]?.total ?? 0), targets: targets.rows.map((target) => ({ id: target.id, fullName: target.full_name, selected: target.selected })), report: subscription ? { email: subscription.email, intervalMinutes: subscription.interval_minutes, verifiedAt: subscription.verified_at?.toISOString() ?? null, lastSentAt: subscription.last_sent_at?.toISOString() ?? null } : null, stats };
}
