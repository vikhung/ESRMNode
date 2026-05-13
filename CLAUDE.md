# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ESRM 專案開發規範
# Enterprise Software Risk Monitor

## ClaudeCode互動規範

- 執行過程中所產生的任何描述，請用繁體中文說明

---

## 語言規範

- 所有產生的程式碼註解使用繁體中文
- 所有 UI 介面文字使用繁體中文
- 所有回覆與說明使用繁體中文
- 程式碼中的變數名稱、方法名稱維持英文

---

## 專案概述

企業軟體風險監控系統，部署於 **Vercel 雲端**：
- 員工執行 esrm-agent.ps1 掃描本機軟體後上傳
- Admin 在系統內直接觸發 NVD CVE 批次查詢
- 各層主管依角色查看軟體弱點狀態
- 支援 CSV/Excel 報表匯出

---

## 常用指令

```bash
# 安裝依賴
pnpm install

# 本地開發
pnpm dev

# 建置
pnpm build

# 型別檢查
pnpm typecheck

# Lint
pnpm lint

# 測試
pnpm test
pnpm test src/lib/software-key.test.ts   # 單一測試

# 資料庫操作
pnpm db:generate    # 產生 migration 檔案
pnpm db:migrate     # 執行 migration
pnpm db:push        # 直接 push schema（開發用）
pnpm db:studio      # 開啟 Drizzle Studio（DB 瀏覽器）
pnpm db:seed        # 插入預設測試帳號與組織資料
```

---

## 技術棧

| 項目 | 規格 |
|------|------|
| 執行環境 | Node.js 20 LTS |
| 語言 | TypeScript 5.x |
| 全端框架 | Next.js 15（App Router） |
| UI 元件 | shadcn/ui + Tailwind CSS 4.x |
| 認證 | NextAuth.js v5（Auth.js，Credentials Provider） |
| ORM | Drizzle ORM |
| 資料庫 | Neon（Serverless PostgreSQL） |
| 報表匯出 | ExcelJS（Excel）+ csv-stringify（CSV） |
| 套件管理 | pnpm |
| 部署 | Vercel |

---

## 套件結構與關鍵路徑

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # 導向 /dashboard
│   ├── login/page.tsx
│   ├── dashboard/page.tsx
│   ├── software/
│   │   ├── my/page.tsx
│   │   ├── group/[groupId]/page.tsx
│   │   ├── dept/[deptId]/page.tsx
│   │   └── all/page.tsx
│   ├── admin/
│   │   ├── org/page.tsx            # 組織管理
│   │   └── users/page.tsx          # 使用者管理
│   ├── vuln/scan/page.tsx          # 弱點掃描（Admin）
│   ├── report/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── software/upload/route.ts
│       ├── software/agent/route.ts
│       ├── vuln/scan/route.ts
│       ├── vuln/progress/route.ts
│       └── report/route.ts
├── components/
│   ├── ui/                         # shadcn/ui 元件
│   ├── layout/navbar.tsx
│   ├── layout/sidebar.tsx          # 依角色顯示選單項目
│   ├── software/
│   ├── admin/
│   └── vuln/
└── lib/
    ├── auth.ts                     # NextAuth 設定、hasRole() 輔助函式
    ├── db/
    │   ├── index.ts                # Drizzle + Neon 連線
    │   ├── schema.ts               # 所有資料表 Schema 定義
    │   └── seed.ts                 # 預設測試帳號與組織資料
    ├── actions/                    # Next.js Server Actions（業務邏輯）
    │   ├── software.ts
    │   ├── org.ts
    │   ├── users.ts
    │   └── report.ts
    ├── software-key.ts             # buildKey() 工具函式
    └── known-versions.json         # 本地最新版本資料（弱點查詢輔助）
```

關鍵靜態資源：
- `src/lib/known-versions.json`：本地維護的最新版本資料庫（弱點查詢輔助，查不到回傳 null）
- `public/agent/esrm-agent.ps1`：員工掃描腳本，透過 `/api/software/agent` 下載

---

## 強制限制（每次實作都必須遵守）

### 絕對不可以
- 引入非 Neon/Postgres 的資料庫依賴（SQLite、H2、Redis、MongoDB 等）
- 在 UI 中使用 CDN 連結（改用 npm 套件）
- 在 Route Handler 直接寫業務邏輯，邏輯必須在 Server Action 或獨立 lib 函式
- 修改與本次任務無關的現有檔案

### 必須遵守
- 資料存取一律透過 Drizzle ORM（`src/lib/db/index.ts`）
- 所有 Server Action 函式頂部必須呼叫 `auth()` 驗證 session，再確認 role
- 路由保護一律在 `middleware.ts` 處理；Server Action 內再次驗證（Defense in Depth）
- 危險操作（刪除）加 shadcn/ui `AlertDialog` 確認

### 套件安全規則
- **優先使用主流且維護活躍的套件**：選擇 npm 週下載量大、有持續更新紀錄、無廢棄警告的套件
- **引入新套件前必須確認無已知高危弱點**：在 [npmjs.com](https://npmjs.com) 查看 Security 標籤，或執行 `pnpm audit` 確認
- **禁止引入有 High / Critical CVE 的套件**：若找不到安全替代方案，必須先向使用者說明風險再行決定
- **定期維護**：若 `pnpm audit` 回報高危漏洞，優先升級受影響套件，而非加 `--ignore-scripts` 繞過
- **版本鎖定**：`pnpm-lock.yaml` 必須加入版本控制，確保環境一致性

---

## 常用程式碼模式

```typescript
// Server Action 取得當前登入使用者
import { auth } from '@/lib/auth'
const session = await auth()
if (!session?.user) throw new Error('未登入')
const { username, role, deptId, groupId } = session.user

// 角色判斷輔助函式
import { hasRole } from '@/lib/auth'
if (!hasRole(session, 'ROLE_LEADER')) throw new Error('權限不足')

// buildKey（禁止自行拼接字串）
import { buildKey } from '@/lib/software-key'
const key = buildKey(name, version)          // 字串重載
const key = buildKey(entry)                  // { name, version } 重載
```

---

## 角色與權限

角色階層（高階自動繼承低階權限）：
```
ROLE_ADMIN > ROLE_DIRECTOR > ROLE_MANAGER > ROLE_LEADER > ROLE_MEMBER
```

| 角色 | 可查看軟體範圍 |
|------|--------------|
| MEMBER | 只能看自己 |
| LEADER | 本組所有人 |
| MANAGER / DIRECTOR | 本部門所有人 |
| ADMIN | 全公司所有人 |

---

## 測試帳號（pnpm db:seed 產生）

| 帳號 | 密碼 | 角色 | 部門 | 組 |
|------|------|------|------|----|
| admin | Admin@123 | ROLE_ADMIN | - | - |
| director1 | Test@123 | ROLE_DIRECTOR | dept-rd | - |
| director2 | Test@123 | ROLE_DIRECTOR | dept-sys | - |
| manager1 | Test@123 | ROLE_MANAGER | dept-rd | - |
| manager2 | Test@123 | ROLE_MANAGER | dept-rd | - |
| manager3 | Test@123 | ROLE_MANAGER | dept-sys | - |
| leader1 | Test@123 | ROLE_LEADER | dept-rd | grp-rd1 |
| leader2 | Test@123 | ROLE_LEADER | dept-rd | grp-rd2 |
| leader3 | Test@123 | ROLE_LEADER | dept-sys | grp-sys1 |
| vik | Test@123 | ROLE_MEMBER | dept-rd | grp-rd1 |
| bob | Test@123 | ROLE_MEMBER | dept-rd | grp-rd1 |
| alice | Test@123 | ROLE_MEMBER | dept-rd | grp-rd1 |
| david | Test@123 | ROLE_MEMBER | dept-rd | grp-rd2 |
| eve | Test@123 | ROLE_MEMBER | dept-rd | grp-rd2 |
| user1 | Test@123 | ROLE_MEMBER | dept-sys | grp-sys1 |
| user2 | Test@123 | ROLE_MEMBER | dept-sys | grp-sys1 |

---

## 重要資料規則

1. **使用者軟體資訊只保留最新一份**：上傳時刪除既有 `software_entries` 紀錄再重新插入，`software_info` 則 upsert
2. **弱點快取 key 格式**：`"{softwareName}|{version}"`，例如 `"Google Chrome|124.0.6367.82"`；必須透過 `buildKey()` 產生
3. **弱點資訊與使用者無關**：以軟體名稱+版本為 key，全公司共用一份快取
4. **查詢軟體後必須合併弱點快取**：所有 get 方法都要 join `vuln_cache` 填入弱點資訊

---

## 實作前必須做的事

每次開始新任務前，請依序：

1. 閱讀對應任務的需求文件（`docs/0X-xxx.md`）
2. **列出本次將新增或修改的檔案清單，等待確認後再動手**
3. 確認不會動到與本次任務無關的現有檔案

---

## 除錯速查

| 症狀 | 排查方向 |
|------|----------|
| NextAuth 登入失敗 | 確認 `AUTH_SECRET` 已設定；Credentials callback 錯誤訊息看 server log |
| Drizzle 找不到資料表 | 執行 `pnpm db:push` 或 `pnpm db:migrate` |
| Server Action 無效 | 確認函式最頂行有 `'use server'` |
| Middleware 無法讀取 session | `middleware.ts` 使用 `auth()` wrapper，確認 `AUTH_SECRET` 一致 |
| Vercel 函式 timeout | 掃描批次改小；或升級 Vercel Pro 延長 timeout |
| Neon connection 錯誤 | 確認 `DATABASE_URL` 包含 `?sslmode=require` |
| 弱點掃描無反應 | 確認使用者角色為 ROLE_ADMIN |

---

## 需求文件索引

| 檔案 | 說明 |
|------|------|
| `docs/00.SA-requirements.md` | 系統需求分析（SA）—— 功能需求、角色、業務規則（無技術細節） |
| `docs/00.SD-design.md` | 系統設計（SD）—— 技術架構、元件設計、設定規格（每次必讀） |
| `docs/01-data-model.md` | Drizzle Schema、資料表設計、seed 資料 |
| `docs/02-security-auth.md` | NextAuth.js、登入頁、共用版面 |
| `docs/03-org-admin.md` | 組織 CRUD、使用者管理、Admin 頁面 |
| `docs/04-software.md` | 軟體上傳、查看頁面、儀表板 |
| `docs/05-vuln.md` | NVD API 弱點查詢 |
| `docs/06-report.md` | CSV/Excel 報表 |
| `docs/07-agent-and-checklist.md` | esrm-agent.ps1、整合驗收、部署說明 |
