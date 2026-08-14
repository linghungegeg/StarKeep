import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail, verificationEmail } from "@/lib/email";
import { query } from "@/lib/db";
import { REPORT_INTERVALS } from "@/lib/reports";
import { createReportVerificationToken, getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  intervalMinutes: z.union([z.literal(1440), z.literal(4320), z.literal(10080)])
});

type Subscription = { email: string; interval_minutes: number; enabled: boolean; verified_at: Date | null; verification_sent_at: Date | null; last_sent_at: Date | null; last_attempt_at: Date | null; last_error: string | null };

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "请先绑定 GitHub Token。" }, { status: 401 });
  const result = await query<Subscription>("SELECT email, interval_minutes, enabled, verified_at, verification_sent_at, last_sent_at, last_attempt_at, last_error FROM email_subscriptions WHERE user_id = $1", [userId]);
  const subscription = result.rows[0];
  return NextResponse.json({ subscription: subscription ? { email: subscription.email, intervalMinutes: subscription.interval_minutes, verifiedAt: subscription.verified_at?.toISOString() ?? null, verificationSentAt: subscription.verification_sent_at?.toISOString() ?? null, lastSentAt: subscription.last_sent_at?.toISOString() ?? null } : null });
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "请先绑定 GitHub Token。" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !REPORT_INTERVALS.includes(parsed.data.intervalMinutes)) return NextResponse.json({ error: "请填写有效邮箱并选择接收周期。" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const existing = await query<Subscription>("SELECT email, interval_minutes, enabled, verified_at, verification_sent_at, last_sent_at, last_attempt_at, last_error FROM email_subscriptions WHERE user_id = $1", [userId]);
  const current = existing.rows[0];
  const unchangedVerified = current?.email === email && current.verified_at;
  if (unchangedVerified) {
    await query("UPDATE email_subscriptions SET interval_minutes = $2, enabled = true, last_sent_at = now(), updated_at = now() WHERE user_id = $1", [userId, parsed.data.intervalMinutes]);
    return NextResponse.json({ verified: true });
  }
  if (current?.verification_sent_at && current.verification_sent_at.getTime() > Date.now() - 10 * 60_000) return NextResponse.json({ error: "确认邮件刚刚发出，请 10 分钟后再试。" }, { status: 429 });

  const token = await createReportVerificationToken(userId, email);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const publicOrigin = forwardedHost ? `${forwardedProto ?? "https"}://${forwardedHost}` : request.nextUrl.origin;
  const confirmationUrl = new URL("/api/reports/confirm", publicOrigin);
  confirmationUrl.searchParams.set("token", token);
  await query("INSERT INTO email_subscriptions (user_id, email, interval_minutes, enabled, verification_sent_at, verified_at, last_sent_at, last_error) VALUES ($1, $2, $3, true, NULL, NULL, NULL, NULL) ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, interval_minutes = EXCLUDED.interval_minutes, enabled = true, verification_sent_at = NULL, verified_at = NULL, last_sent_at = NULL, last_error = NULL, updated_at = now()", [userId, email, parsed.data.intervalMinutes]);
  try {
    await sendEmail({ to: email, subject: "确认 StarKeep 操作简报邮箱", html: verificationEmail(confirmationUrl.toString()), idempotencyKey: `starkeep-report-confirm-${userId}-${Math.floor(Date.now() / 600_000)}` });
    await query("UPDATE email_subscriptions SET verification_sent_at = now(), updated_at = now() WHERE user_id = $1", [userId]);
    return NextResponse.json({ pendingVerification: true });
  } catch (error) {
    if (current) await query("UPDATE email_subscriptions SET email = $2, interval_minutes = $3, enabled = $4, verified_at = $5, verification_sent_at = $6, last_sent_at = $7, last_attempt_at = $8, last_error = $9, updated_at = now() WHERE user_id = $1 AND email = $10 AND verified_at IS NULL AND verification_sent_at IS NULL", [userId, current.email, current.interval_minutes, current.enabled, current.verified_at, current.verification_sent_at, current.last_sent_at, current.last_attempt_at, current.last_error, email]);
    else await query("DELETE FROM email_subscriptions WHERE user_id = $1 AND email = $2 AND verified_at IS NULL AND verification_sent_at IS NULL", [userId, email]);
    return NextResponse.json({ error: error instanceof Error ? "确认邮件发送失败，请检查服务配置后重试。" : "确认邮件发送失败。" }, { status: 503 });
  }
}
