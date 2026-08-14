const GITHUB_API = "https://api.github.com";

export type GitHubRepository = { id: number; full_name: string; name: string; html_url: string; owner: { login: string }; private: boolean };
export type StarredRepository = { starred_at: string; repo: GitHubRepository };
export type GitHubUser = { id: number; login: string; avatar_url: string };

export class GitHubApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function github<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...init.headers },
    cache: "no-store"
  });
  if (!response.ok) throw new GitHubApiError(response.status, (await response.text()) || `GitHub request failed (${response.status}).`);
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

async function allPages<T>(path: string, token: string, init?: RequestInit) {
  const result: T[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const divider = path.includes("?") ? "&" : "?";
    const batch = await github<T[]>(`${path}${divider}per_page=100&page=${page}`, token, init);
    result.push(...batch);
    if (batch.length < 100) return result;
  }
  throw new Error("GitHub pagination exceeded 10,000 records.");
}

export const getGithubUser = (token: string) => github<GitHubUser>("/user", token);
export const listStarred = (token: string) => allPages<StarredRepository>("/user/starred", token, { headers: { Accept: "application/vnd.github.star+json" } });
export const listOwnPublicRepos = async (token: string) => (await allPages<GitHubRepository>("/user/repos?affiliation=owner&visibility=public", token)).filter((repo) => !repo.private);
export const listStargazers = (owner: string, repo: string, token: string) => allPages<{ login: string }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stargazers`, token);
export const star = (owner: string, repo: string, token: string) => github<void>(`/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token, { method: "PUT", headers: { "Content-Length": "0" } });
export const unstar = (owner: string, repo: string, token: string) => github<void>(`/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token, { method: "DELETE", headers: { "Content-Length": "0" } });
