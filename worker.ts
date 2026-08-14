import { Worker } from "bullmq";
import { query } from "./lib/db";
import { scanUser } from "./lib/monitor";
import { queueReciprocalOrder, queueReport, queueScan } from "./lib/queue";
import { enqueueDueReportUsers, sendUserReport } from "./lib/reports";
import { processReciprocalOrder } from "./lib/reciprocal";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379", maxRetriesPerRequest: null };

new Worker("monitor", async (job) => {
  if (job.name === "reciprocal-star") return processReciprocalOrder(job.data.orderId);
  if (job.name !== "scan-user") return;
  return scanUser(job.data.userId);
}, { connection, concurrency: 2 });

new Worker("reports", async (job) => {
  if (job.name !== "send-report") return;
  return sendUserReport(job.data.userId);
}, { connection, concurrency: 1 });

async function enqueueDueScans() {
  const due = await query<{ user_id: string }>("SELECT user_id FROM monitor_policies WHERE enabled = true AND (last_scan_at IS NULL OR last_scan_at <= now() - (interval_minutes * interval '1 minute'))");
  await Promise.all(due.rows.map(({ user_id }) => queueScan(user_id)));
}

async function enqueueDueReports() {
  const due = await enqueueDueReportUsers();
  await Promise.all(due.rows.map(({ user_id }) => queueReport(user_id)));
}

async function enqueueDueReciprocalOrders() {
  const due = await query<{ id: string }>("SELECT id FROM reciprocal_orders WHERE status IN ('OWNER_PENDING', 'FAILED') AND attempts < 3 ORDER BY updated_at ASC LIMIT 100");
  await Promise.all(due.rows.map(({ id }) => queueReciprocalOrder(id)));
}

async function enqueueDueWork() {
  await Promise.all([enqueueDueScans(), enqueueDueReports(), enqueueDueReciprocalOrders()]);
}

async function main() {
  await enqueueDueWork();
  setInterval(() => void enqueueDueWork().catch((error) => console.error("Failed to enqueue scheduled work", error)), 60_000);
  console.log("StarKeep worker is running.");
}

void main().catch((error) => {
  console.error("Failed to start StarKeep worker", error);
  process.exitCode = 1;
});
