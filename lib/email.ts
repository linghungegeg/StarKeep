type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

const senderEmail = process.env.RESEND_FROM_EMAIL ?? "starkeep@zysj.site";
const senderName = process.env.RESEND_FROM_NAME ?? "starkeep";

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function sendEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "StarKeep/0.1",
      "Idempotency-Key": message.idempotencyKey
    },
    body: JSON.stringify({ from: `${senderName} <${senderEmail}>`, to: [message.to], subject: message.subject, html: message.html })
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !payload.id) throw new Error(payload.message || payload.name || "Email delivery failed.");
  return payload.id;
}

const emailLayout = (title: string, body: string) => `<!doctype html><html lang="zh-CN"><body style="margin:0;background:#f4f6f8;color:#172036;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><main style="max-width:620px;margin:0 auto;padding:32px 16px"><section style="overflow:hidden;border:1px solid #e5eaf0;border-radius:10px;background:#fff"><header style="padding:22px 26px;background:#1f6fff;color:#fff"><div style="font-size:18px;font-weight:700">StarKeep</div><div style="margin-top:5px;font-size:12px;opacity:.84">互 Star 关系监控</div></header><div style="padding:26px">${body}</div><footer style="padding:16px 26px;border-top:1px solid #edf0f4;color:#7a8798;font-size:12px">由 StarKeep 自动发送，请勿直接回复此邮件。</footer></section></main></body></html>`;

export function verificationEmail(verificationUrl: string) {
  return emailLayout("确认操作简报", `<h1 style="margin:0;font-size:22px">确认操作简报邮箱</h1><p style="margin:14px 0;color:#5f6e83;line-height:1.7">确认后，StarKeep 将按你选择的周期发送累计检测与取消 Star 记录，不会对单条关系变化单独发送邮件。</p><p style="margin:22px 0"><a href="${escapeHtml(verificationUrl)}" style="display:inline-block;padding:11px 16px;border-radius:6px;background:#1f6fff;color:#fff;font-weight:700;text-decoration:none">确认接收简报</a></p><p style="margin:0;color:#8691a1;font-size:12px;line-height:1.6">此链接 24 小时内有效。若不是你本人设置，请忽略此邮件。</p>`);
}

export function reportEmail(periodLabel: string, stats: { scans: number; checked: number; globalRepos: number; mutual: number; changes: number; unstarred: number; failedUnstars: number }, activities: string[], blacklist: { ownerLogin: string }[], blacklistTotal: number, siteUrl: string) {
  const card = (label: string, value: number) => `<td style="width:33.33%;padding:5px"><div style="padding:13px;border:1px solid #e8edf4;border-radius:7px;background:#fafbfd"><div style="color:#7a8798;font-size:11px">${label}</div><strong style="display:block;margin-top:5px;font-size:21px">${value}</strong></div></td>`;
  const firstRow = [card("检测次数", stats.scans), card("检查仓库", stats.checked), card("保持关系", stats.mutual)].join("");
  const secondRow = [card("关系变化", stats.changes), card("取消记录", stats.unstarred), card("全站仓库", stats.globalRepos)].join("");
  const activityRows = activities.length ? activities.map((activity) => `<li style="margin:0 0 8px;color:#56657a;line-height:1.55">${escapeHtml(activity)}</li>`).join("") : "<li style=\"color:#56657a;line-height:1.55\">本周期内没有新的操作记录。</li>";
  const blacklistSection = blacklist.length ? `<h2 style="margin:24px 0 12px;font-size:15px">本周期新增全站黑名单</h2><ul style="margin:0;padding-left:18px;font-size:13px">${blacklist.map((entry) => `<li style="margin:0 0 8px;color:#56657a;line-height:1.55">@${escapeHtml(entry.ownerLogin)}</li>`).join("")}</ul>${blacklistTotal > blacklist.length ? `<p style="margin:12px 0 0;color:#7a8798;font-size:12px">仅展示部分黑名单，当前共 ${blacklistTotal} 条。其余记录请进入主站查看。</p>` : ""}` : "";
  const failureNote = stats.failedUnstars ? `<p style="margin:16px 0 0;color:#b44c5e;font-size:12px">有 ${stats.failedUnstars} 条取消 Star 操作未成功，请在执行日志中查看详情。</p>` : "";
  const siteButton = `<p style="margin:24px 0 0"><a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:11px 16px;border-radius:6px;background:#1f6fff;color:#fff;font-weight:700;text-decoration:none">进入 StarKeep 主站</a></p>`;
  return emailLayout("操作简报", `<p style="margin:0;color:#6b7788;font-size:12px">${escapeHtml(periodLabel)}</p><h1 style="margin:7px 0 18px;font-size:22px">操作简报</h1><table role="presentation" style="width:100%;border-collapse:collapse"><tbody><tr>${firstRow}</tr><tr>${secondRow}</tr></tbody></table>${failureNote}${blacklistSection}<h2 style="margin:24px 0 12px;font-size:15px">累计操作记录</h2><ul style="margin:0;padding-left:18px;font-size:13px">${activityRows}</ul>${siteButton}`);
}
