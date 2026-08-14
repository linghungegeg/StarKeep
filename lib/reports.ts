import { reportEmail, sendEmail } from "./email";
import { query } from "./db";

export const REPORT_INTERVALS = [1440, 4320, 10080] as const;

type SubscriptionRow = {
  user_id: string;
  email: string;
  interval_minutes: number;
  enabled: boolean;
  verified_at: Date | null;
  verification_sent_at: Date | null;
  last_sent_at: Date | null;
  last_attempt_at: Date | null;
  last_error: string | null;
};

type ScanTotals = { scans: number; checked: number; mutual: number; changes: number; global_repos: number };
type ActionTotals = { success: number; failed: number };

function periodLabel(start: Date, end: Date) {
  const format = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
  return `${format.format(start)} 至 ${format.format(end)}`;
}

export async function enqueueDueReportUsers() {
  return query<{ user_id: string }>("SELECT user_id FROM email_subscriptions WHERE enabled = true AND verified_at IS NOT NULL AND (last_sent_at IS NULL OR last_sent_at <= now() - (interval_minutes * interval '1 minute')) AND (last_attempt_at IS NULL OR last_attempt_at <= now() - interval '10 minutes')");
}

export async function sendUserReport(userId: string) {
  const claimed = await query<SubscriptionRow>("UPDATE email_subscriptions SET last_attempt_at = now(), updated_at = now() WHERE user_id = $1 AND enabled = true AND verified_at IS NOT NULL AND (last_sent_at IS NULL OR last_sent_at <= now() - (interval_minutes * interval '1 minute')) AND (last_attempt_at IS NULL OR last_attempt_at <= now() - interval '10 minutes') RETURNING user_id, email, interval_minutes, enabled, verified_at, verification_sent_at, last_sent_at, last_attempt_at, last_error", [userId]);
  const subscription = claimed.rows[0];
  if (!subscription || !subscription.verified_at) return;

  const startedAt = subscription.last_sent_at ?? subscription.verified_at;
  const endedAt = new Date();
  try {
    const [scans, actions, scanActivities, actionActivities, blacklistEntries, blacklistTotal] = await Promise.all([
      query<ScanTotals>("SELECT COUNT(*)::int AS scans, COALESCE(SUM(checked_count), 0)::int AS checked, (SELECT COUNT(*)::int FROM managed_repositories WHERE enabled = true) AS global_repos, COALESCE(SUM(mutual_count), 0)::int AS mutual, COALESCE(SUM(not_mutual_count), 0)::int AS changes FROM scan_runs WHERE user_id = $1 AND started_at >= $2", [userId, startedAt]),
      query<ActionTotals>("SELECT COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success, COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed FROM unstar_actions WHERE user_id = $1 AND created_at >= $2", [userId, startedAt]),
      query<{ status: string; checked_count: number; mutual_count: number; not_mutual_count: number; started_at: Date }>("SELECT status, checked_count, mutual_count, not_mutual_count, started_at FROM scan_runs WHERE user_id = $1 AND started_at >= $2 ORDER BY started_at DESC LIMIT 5", [userId, startedAt]),
      query<{ status: string; mode: string; full_name: string; created_at: Date }>("SELECT a.status, a.mode, r.full_name, a.created_at FROM unstar_actions a JOIN tracked_repositories r ON r.id = a.tracked_repository_id WHERE a.user_id = $1 AND a.created_at >= $2 ORDER BY a.created_at DESC LIMIT 5", [userId, startedAt]),
      query<{ owner_login: string }>("SELECT owner_login FROM blacklist_entries WHERE detected_at >= $1 ORDER BY detected_at DESC LIMIT 5", [startedAt]),
      query<{ total: number }>("SELECT COUNT(*)::int AS total FROM blacklist_entries WHERE detected_at >= $1", [startedAt])
    ]);
    const scanTotal = scans.rows[0] ?? { scans: 0, checked: 0, global_repos: 0, mutual: 0, changes: 0 };
    const actionTotal = actions.rows[0] ?? { success: 0, failed: 0 };
    const activities = [
      ...scanActivities.rows.map((row) => ({ at: row.started_at, text: `${periodLabel(row.started_at, row.started_at)} ${row.status === "COMPLETED" ? `完成检测 ${row.checked_count} 个仓库，关系变化 ${row.not_mutual_count} 个` : "检测执行失败"}` })),
      ...actionActivities.rows.map((row) => ({ at: row.created_at, text: `${periodLabel(row.created_at, row.created_at)} ${row.status === "SUCCESS" ? "已取消" : "取消失败"} ${row.full_name} 的 Star（${row.mode === "AUTOMATIC" ? "自动" : "手动"}）` }))
    ].sort((left, right) => right.at.getTime() - left.at.getTime()).slice(0, 8).map((activity) => activity.text);
    const siteUrl = (process.env.PUBLIC_ORIGIN ?? "http://localhost:3000").trim().replace(/\/$/, "");
    const emailId = await sendEmail({ to: subscription.email, subject: `StarKeep 操作简报 · ${periodLabel(startedAt, endedAt)}`, html: reportEmail(periodLabel(startedAt, endedAt), { scans: scanTotal.scans, checked: scanTotal.checked, globalRepos: scanTotal.global_repos, mutual: scanTotal.mutual, changes: scanTotal.changes, unstarred: actionTotal.success, failedUnstars: actionTotal.failed }, activities, blacklistEntries.rows.map((entry) => ({ ownerLogin: entry.owner_login })), blacklistTotal.rows[0]?.total ?? 0, siteUrl), idempotencyKey: `starkeep-report-${userId}-${startedAt.getTime()}` });
    await query("INSERT INTO email_report_deliveries (user_id, email, period_started_at, period_ended_at, status, resend_email_id) VALUES ($1, $2, $3, $4, 'SENT', $5)", [userId, subscription.email, startedAt, endedAt, emailId]);
    await query("UPDATE email_subscriptions SET last_sent_at = now(), last_error = NULL, updated_at = now() WHERE user_id = $1", [userId]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed.";
    await query("INSERT INTO email_report_deliveries (user_id, email, period_started_at, period_ended_at, status, error_message) VALUES ($1, $2, $3, $4, 'FAILED', $5)", [userId, subscription.email, startedAt, endedAt, message]);
    await query("UPDATE email_subscriptions SET last_error = $2, updated_at = now() WHERE user_id = $1", [userId, message]);
    throw error;
  }
}
