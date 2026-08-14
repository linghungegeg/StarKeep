import { Queue } from "bullmq";

let monitorQueue: Queue | undefined;
let reportQueue: Queue | undefined;

export function getMonitorQueue() {
  if (!monitorQueue) {
    monitorQueue = new Queue("monitor", { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379", maxRetriesPerRequest: null } });
  }
  return monitorQueue;
}

export async function queueScan(userId: string) {
  return getMonitorQueue().add("scan-user", { userId }, { jobId: `scan-${userId}`, removeOnComplete: true, removeOnFail: true });
}

export async function queueReciprocalOrder(orderId: string) {
  return getMonitorQueue().add("reciprocal-star", { orderId }, { jobId: `reciprocal-${orderId}`, removeOnComplete: true, removeOnFail: true });
}

export function getReportQueue() {
  if (!reportQueue) {
    reportQueue = new Queue("reports", { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379", maxRetriesPerRequest: null } });
  }
  return reportQueue;
}

export async function queueReport(userId: string) {
  return getReportQueue().add("send-report", { userId }, { jobId: `report-${userId}`, removeOnComplete: true, removeOnFail: true });
}
