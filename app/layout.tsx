import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StarKeep - GitHub互赞广场与Star监控",
  description: "StarKeep 提供 GitHub 互赞广场、Token 托管、默认仓库自动回赞和 Star 关系检测，记录互赞状态并支持发现取消 Star。",
  keywords: ["StarKeep", "GitHub 互赞", "互赞广场", "GitHub Star", "GitHub Star 监控", "GitHub Token 托管", "自动回赞", "Star 关系检测"]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
