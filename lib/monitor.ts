import { GitHubApiError, listStargazers, unstar } from "./github";
import { query } from "./db";
import { invalidateCredential, tokenFor } from "./repository";
import { syncGithubAccount } from "./sync";

type Policy = { enabled: boolean; consecutive_failures_required: number; auto_unstar_enabled: boolean };
type Tracked = { id: string; full_name: string; owner_login: string; name: string; whitelisted: boolean; consecutive_not_mutual: number; relationship_status: "MUTUAL" | "NOT_MUTUAL" | "UNKNOWN"; ever_mutual: boolean };

export async function scanUser(userId: string) {
  const policyResult = await query<Policy>("SELECT enabled, consecutive_failures_required, auto_unstar_enabled FROM monitor_policies WHERE user_id = $1", [userId]);
  const policy = policyResult.rows[0];
  if (!policy?.enabled) return { skipped: true };

  await query("UPDATE monitor_policies SET last_scan_at = now(), updated_at = now() WHERE user_id = $1", [userId]);
  const credential = await query<{ invalidated_at: Date | null }>("SELECT invalidated_at FROM github_credentials WHERE user_id = $1", [userId]);
  if (credential.rows[0]?.invalidated_at) return { skipped: true, reason: "TOKEN_INVALIDATED" };

  const run = await query<{ id: string }>("INSERT INTO scan_runs (user_id, status) VALUES ($1, 'RUNNING') RETURNING id", [userId]);
  const runId = run.rows[0].id;
  try {
    const token = await tokenFor(userId);
    await syncGithubAccount(userId, token);
    const targets = await query<{ owner_login: string; name: string }>("SELECT owner_login, name FROM target_repositories WHERE user_id = $1 AND selected = true", [userId]);
    if (!targets.rowCount) throw new Error("At least one target repository must be selected before scanning.");

    const stargazers = new Set<string>();
    for (const target of targets.rows) {
      const users = await listStargazers(target.owner_login, target.name, token);
      users.forEach((user) => stargazers.add(user.login.toLowerCase()));
    }

    const tracked = await query<Tracked>("SELECT id, full_name, owner_login, name, whitelisted, consecutive_not_mutual, relationship_status, ever_mutual FROM tracked_repositories WHERE user_id = $1 AND enabled = true AND unstarred_at IS NULL", [userId]);
    let mutual = 0;
    let changed = 0;
    let unmatched = 0;
    let autoUnstarred = 0;
    for (const repo of tracked.rows) {
      const isMutual = stargazers.has(repo.owner_login.toLowerCase());
      const failures = isMutual ? 0 : repo.consecutive_not_mutual + 1;
      if (isMutual) mutual += 1;
      else if (repo.ever_mutual) changed += 1;
      else unmatched += 1;
      await query("UPDATE tracked_repositories SET relationship_status = $2, consecutive_not_mutual = $3, ever_mutual = ever_mutual OR $4, last_checked_at = now(), last_error = NULL, updated_at = now() WHERE id = $1", [repo.id, isMutual ? "MUTUAL" : "NOT_MUTUAL", failures, isMutual]);
      if (!isMutual && repo.ever_mutual && repo.relationship_status === "MUTUAL") await query("INSERT INTO blacklist_entries (owner_login) VALUES ($1) ON CONFLICT (owner_login) DO UPDATE SET last_detected_at = now(), detection_count = blacklist_entries.detection_count + 1", [repo.owner_login]);
      if (!repo.whitelisted && repo.ever_mutual && !isMutual) {
        try {
          await unstar(repo.owner_login, repo.name, token);
          await query("UPDATE tracked_repositories SET unstarred_at = now(), updated_at = now() WHERE id = $1", [repo.id]);
          await query("INSERT INTO unstar_actions (user_id, tracked_repository_id, mode, status) VALUES ($1, $2, 'AUTOMATIC', 'SUCCESS')", [userId, repo.id]);
          autoUnstarred += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown GitHub unstar error.";
          await query("INSERT INTO unstar_actions (user_id, tracked_repository_id, mode, status, error_message) VALUES ($1, $2, 'AUTOMATIC', 'FAILED', $3)", [userId, repo.id, message]);
        }
      }
    }
    await query("UPDATE scan_runs SET status = 'COMPLETED', checked_count = $2, mutual_count = $3, not_mutual_count = $4, unmatched_count = $5, auto_unstar_count = $6, finished_at = now() WHERE id = $1", [runId, tracked.rowCount, mutual, changed, unmatched, autoUnstarred]);
    return { runId, checked: tracked.rowCount, mutual, changed, unmatched };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 401) {
      await invalidateCredential(userId);
      await query("UPDATE monitor_policies SET enabled = false, updated_at = now() WHERE user_id = $1", [userId]);
    }
    const message = error instanceof GitHubApiError && [401, 403, 429].includes(error.status) ? `GitHub API unavailable (${error.status}); no relationship status was changed.` : error instanceof Error ? error.message : "Unknown scan error.";
    await query("UPDATE scan_runs SET status = 'FAILED', error_message = $2, finished_at = now() WHERE id = $1", [runId, message.slice(0, 1000)]);
    throw error;
  }
}
