import { GitHubApiError, star } from "./github";
import { query } from "./db";
import { invalidateCredential, tokenFor } from "./repository";

type Order = { id: string; owner_user_id: string; requester_user_id: string; owner_login: string; owner_name: string; requester_login: string; requester_name: string };

export async function processReciprocalOrder(orderId: string) {
  const result = await query<Order>("SELECT o.id, o.owner_user_id, o.requester_user_id, s.owner_login, s.name AS owner_name, r.owner_login AS requester_login, r.name AS requester_name FROM reciprocal_orders o JOIN managed_repositories s ON s.id = o.source_managed_repository_id JOIN managed_repositories r ON r.id = o.requester_repository_id WHERE o.id = $1 AND o.status IN ('OWNER_PENDING', 'FAILED') AND o.attempts < 3 AND s.enabled = true AND r.enabled = true", [orderId]);
  if (!result.rowCount) return { skipped: true };
  const order = result.rows[0];
  await query("UPDATE reciprocal_orders SET attempts = attempts + 1, updated_at = now() WHERE id = $1", [orderId]);
  try {
    await star(order.requester_login, order.requester_name, await tokenFor(order.owner_user_id));
    await query("UPDATE reciprocal_orders SET status = 'COMPLETED', owner_starred_at = now(), last_error = NULL, updated_at = now() WHERE id = $1", [orderId]);
    return { completed: true };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 401) await invalidateCredential(order.owner_user_id);
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Reciprocal Star failed.";
    await query("UPDATE reciprocal_orders SET status = 'FAILED', last_error = $2, updated_at = now() WHERE id = $1", [orderId, message]);
    throw error;
  }
}
