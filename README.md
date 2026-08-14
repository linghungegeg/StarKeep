<div align="center">

# StarKeep

**GitHub 互赞广场与 Star 监控**

[![English](https://img.shields.io/badge/Language-English-2563eb?style=flat-square)](README.en.md)
[![Apache License 2.0](https://img.shields.io/badge/License-Apache--2.0-d97706?style=flat-square)](LICENSE)
[![官网](https://img.shields.io/badge/%E5%AE%98%E7%BD%91-StarKeep-2563eb?style=flat-square)](https://star.2fakey.icu/)

<img src="https://img.shields.io/badge/Next.js-16.3.0-111827?logo=nextdotjs&logoColor=white" alt="Next.js" />
<img src="https://img.shields.io/badge/React-19.1.1-149eca?logo=react&logoColor=white" alt="React" />
<img src="https://img.shields.io/badge/PostgreSQL-17-31648c?logo=postgresql&logoColor=white" alt="PostgreSQL" />
<img src="https://img.shields.io/badge/Redis-7-d82c20?logo=redis&logoColor=white" alt="Redis" />
<img src="https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker&logoColor=white" alt="Docker" />

</div>

StarKeep 是一个基于 GitHub Fine-grained Token 的 Star 关系管理工具。用户可设置多个公开仓库参与互赞、选择默认回赞仓库，并持续检查已建立的互赞关系。

## 功能特点

- **互赞广场**：公开展示已托管仓库，访客可浏览；绑定 Token 后可发起互赞。
- **默认自动回赞**：一个用户可托管多个仓库，并指定其中一个作为默认回赞仓库。
- **关系状态准确区分**：明确展示“保持关系”“未形成互赞”和“关系变化”。
- **自动取消不诚信互赞**：仅对曾经互赞、后来对方取消 Star 的仓库自动取消我方 Star；从未形成互赞的历史主动 Star 不会被自动取消。
- **执行日志与分页**：托管仓库、广场仓库、互赞记录、Star 记录、黑名单和执行日志均支持分页。
- **Token 全局持久化**：同一用户填写过的 Token 会被加密保存，监控页与互赞广场共用，不依赖浏览器缓存。
- **邮箱简报**：可绑定邮箱接收周期简报，汇总检查、关系变化与取消 Star 记录。

## 界面截图

<table>
  <tr>
    <td align="center" width="50%"><img src="img/Snipaste_2026-08-14_07-20-59.png" alt="监控首页" style="border: 1px solid #d0d7de; border-radius: 6px;" /></td>
    <td align="center" width="50%"><img src="img/Snipaste_2026-08-14_07-21-41.png" alt="互赞广场" style="border: 1px solid #d0d7de; border-radius: 6px;" /></td>
  </tr>
  <tr>
    <td align="center"><sub>监控首页</sub></td>
    <td align="center"><sub>互赞广场与我的托管</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="img/Snipaste_2026-08-14_07-21-51.png" alt="互赞记录" style="border: 1px solid #d0d7de; border-radius: 6px;" /></td>
    <td align="center"><img src="img/Snipaste_2026-08-14_06-31-50.png" alt="Token 设置" style="border: 1px solid #d0d7de; border-radius: 6px;" /></td>
  </tr>
  <tr>
    <td align="center"><sub>互赞记录与状态</sub></td>
    <td align="center"><sub>Token 绑定</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="img/Snipaste_2026-08-14_06-31-32.png" alt="邮箱简报" style="border: 1px solid #d0d7de; border-radius: 6px;" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub>邮箱简报设置</sub></td>
  </tr>
</table>

## 技术栈

- **Web**：Next.js 16、React 19、TypeScript、Lucide Icons
- **服务端**：Next.js Route Handlers、Node.js、BullMQ Worker
- **存储与队列**：PostgreSQL 17、Redis 7
- **外部服务**：GitHub REST API、Resend SMTP/API
- **部署**：Docker、Docker Compose

## 项目目录

```text
.
├── app/                         # Next.js 页面、样式与 API 路由
│   ├── api/                     # Token、监控、互赞、简报等接口
│   ├── globals.css              # 全局样式
│   └── page.tsx                 # 主界面与互赞广场
├── db/migrations/               # PostgreSQL 增量迁移
├── lib/                         # GitHub、加密、监控、队列、邮件等业务逻辑
├── scripts/migrate.ts           # 数据库迁移入口
├── img/                         # README 截图、联系方式与赞赏码
├── worker.ts                    # 定时检测、互赞回赞、邮件简报 Worker
├── Dockerfile                   # 生产镜像构建定义
├── docker-compose.prod.yml      # 生产 Compose 编排
└── .env.example                 # 环境变量示例
```

## 部署

### 1. 准备环境

- Docker 与 Docker Compose
- GitHub Fine-grained Token：需授予 `Starring: Read and write`
- 一个可公开访问的站点域名
- PostgreSQL、Redis 由 Compose 自动启动
- 如需邮箱简报，准备 Resend API Key 和已验证发件地址

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少填写以下内容：

```dotenv
POSTGRES_PASSWORD=replace-with-a-strong-password
TOKEN_ENCRYPTION_KEY=replace-with-a-32-byte-secret
SESSION_SECRET=replace-with-a-32-byte-secret
PUBLIC_ORIGIN=https://star.example.com

# 可选：启用邮箱简报
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=starkeep@example.com
RESEND_FROM_NAME=StarKeep
```

可用以下命令生成密钥：

```bash
openssl rand -base64 32
```

### 3. 构建并启动

```bash
docker build -t starkeep:latest .
STARKEEP_IMAGE=starkeep:latest docker compose -f docker-compose.prod.yml up -d db redis
```

执行数据库迁移后，再启动应用和 Worker：

```bash
STARKEEP_IMAGE=starkeep:latest docker compose -f docker-compose.prod.yml run --rm --no-deps app npm run db:migrate
STARKEEP_IMAGE=starkeep:latest docker compose -f docker-compose.prod.yml up -d --no-build app worker
```

默认仅监听 `127.0.0.1:3210`，请通过 Nginx、Caddy 或其他反向代理提供 HTTPS，并把域名写入 `PUBLIC_ORIGIN`。

### 4. 更新版本

生产环境建议在独立构建机完成镜像构建，再将镜像导出、上传并加载到生产机，避免在生产机执行构建：

```bash
# 构建机
docker build -t starkeep:release .
docker save -o starkeep-release.tar starkeep:release

# 生产机
docker load -i starkeep-release.tar
STARKEEP_IMAGE=starkeep:release docker compose -f docker-compose.prod.yml up -d db redis
STARKEEP_IMAGE=starkeep:release docker compose -f docker-compose.prod.yml run --rm --no-deps app npm run db:migrate
STARKEEP_IMAGE=starkeep:release docker compose -f docker-compose.prod.yml up -d --no-build app worker
```

## 使用说明

1. 填写 GitHub Token，系统会同步你已 Star 的仓库和公开仓库。
2. 在“互赞广场”选择一个或多个仓库进行托管，并设置默认回赞仓库。
3. 保存后，托管仓库会进入广场；访客为你的仓库 Star 后，系统会使用你的 Token 自动回赞对方的默认仓库。
4. 首次绑定会立即检查；后续按用户设置的周期检查。
5. 曾互赞后对方取消 Star 时，系统记录关系变化、加入黑名单并自动取消我方 Star；从未形成互赞的仓库仅显示状态，不会被自动取消。

## 联系与赞赏

<table>
  <tr>
    <td align="center" width="50%">
      <strong>微信联系</strong><br /><br />
      <img src="img/wx.jpg" alt="微信联系方式" width="220" style="border: 1px solid #d0d7de; border-radius: 6px;" />
    </td>
    <td align="center" width="50%">
      <strong>赞赏支持</strong><br /><br />
      <img src="img/zhanshang.png" alt="赞赏码" width="260" style="border: 1px solid #d0d7de; border-radius: 6px;" />
    </td>
  </tr>
</table>
