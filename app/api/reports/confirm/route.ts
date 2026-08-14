import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyReportVerificationToken } from "@/lib/session";

export const runtime = "nodejs";

function page(title: string, description: string, success = false) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${title}</title><body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172036"><main style="max-width:520px;margin:80px auto;padding:0 20px"><section style="padding:30px;border:1px solid #e5eaf0;border-radius:10px;background:#fff"><div style="width:36px;height:36px;display:grid;place-items:center;border-radius:7px;background:${success ? "#e6f7f0" : "#fff0f2"};color:${success ? "#167a57" : "#bd4055"};font-weight:700">★</div><h1 style="margin:18px 0 8px;font-size:21px">${title}</h1><p style="margin:0;color:#617086;line-height:1.65">${description}</p></section></main></body></html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse(page("确认链接无效", "请回到 StarKeep 重新保存邮箱并获取新的确认邮件。"), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  try {
    const { userId, email } = await verifyReportVerificationToken(token);
    const updated = await query("UPDATE email_subscriptions SET verified_at = now(), last_sent_at = now(), enabled = true, last_error = NULL, updated_at = now() WHERE user_id = $1 AND email = $2 RETURNING user_id", [userId, email]);
    if (!updated.rowCount) throw new Error("Subscription not found.");
    return new NextResponse(page("邮箱已确认", "操作简报已经启用，StarKeep 会按你选择的周期汇总发送检测与取消 Star 记录。", true), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return new NextResponse(page("确认链接已失效", "请回到 StarKeep 重新保存邮箱并获取新的确认邮件。"), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
