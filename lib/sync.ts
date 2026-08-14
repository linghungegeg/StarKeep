import { db } from "./db";
import { listOwnPublicRepos, listStarred } from "./github";

export async function syncGithubAccount(userId: string, token: string) {
  const [starred, ownRepos] = await Promise.all([listStarred(token), listOwnPublicRepos(token)]);
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    for (const starredRepository of starred) {
      const repo = starredRepository.repo;
      await client.query("INSERT INTO tracked_repositories (user_id, github_repo_id, full_name, owner_login, name, html_url, starred_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (user_id, github_repo_id) DO UPDATE SET full_name = EXCLUDED.full_name, owner_login = EXCLUDED.owner_login, name = EXCLUDED.name, html_url = EXCLUDED.html_url, starred_at = EXCLUDED.starred_at, unstarred_at = NULL, updated_at = now()", [userId, repo.id, repo.full_name, repo.owner.login, repo.name, repo.html_url, starredRepository.starred_at]);
    }
    const starredIds = starred.map((entry) => entry.repo.id);
    if (starredIds.length) await client.query("UPDATE tracked_repositories SET unstarred_at = now(), updated_at = now() WHERE user_id = $1 AND unstarred_at IS NULL AND github_repo_id <> ALL($2::bigint[])", [userId, starredIds]);
    else await client.query("UPDATE tracked_repositories SET unstarred_at = now(), updated_at = now() WHERE user_id = $1 AND unstarred_at IS NULL", [userId]);
    for (const repo of ownRepos) {
      await client.query("INSERT INTO target_repositories (user_id, github_repo_id, full_name, owner_login, name, html_url, selected) VALUES ($1, $2, $3, $4, $5, $6, true) ON CONFLICT (user_id, github_repo_id) DO UPDATE SET full_name = EXCLUDED.full_name, owner_login = EXCLUDED.owner_login, name = EXCLUDED.name, html_url = EXCLUDED.html_url, selected = true, updated_at = now()", [userId, repo.id, repo.full_name, repo.owner.login, repo.name, repo.html_url]);
    }
    await client.query("UPDATE target_repositories SET selected = true, updated_at = now() WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    return { starred: starred.length, targets: ownRepos.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
