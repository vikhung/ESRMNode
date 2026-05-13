# ESRM 資料模型設計文件
# 01 — Drizzle Schema、資料表設計、Seed 資料

**對應步驟**：步驟二  
**前置文件**：`00.SD-design.md` 第五節

---

## 一、資料庫連線（`src/lib/db/index.ts`）

使用 `@neondatabase/serverless` 搭配 Drizzle ORM，從環境變數 `DATABASE_URL` 取得連線字串。

```typescript
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

- 連線字串從 Vercel Dashboard → Storage → Connection Details 複製，格式如：
  `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?channel_binding=require&sslmode=require`
- 本地開發與 Vercel 部署均連接同一個 Neon 雲端資料庫，不使用本地 PostgreSQL
- 不使用 connection pool（Neon serverless 本身處理連線管理）
- 匯出 `db` 供所有 Server Action 使用

---

## 二、Schema 定義（`src/lib/db/schema.ts`）

使用 `drizzle-orm/pg-core` 定義所有資料表。

### 2.1 departments（部門）

```typescript
export const departments = pgTable('departments', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  directorUsername: varchar('director_username', { length: 50 }),
  managerUsernames: text('manager_usernames').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | varchar(50) PK | 部門代碼，例如 `dept-rd` |
| name | varchar(100) | 部門名稱 |
| directorUsername | varchar(50) | 協理帳號（可為空） |
| managerUsernames | text[] | 負責此部門的經理帳號陣列 |
| createdAt | timestamp | 建立時間 |

### 2.2 groups（組）

```typescript
export const groups = pgTable('groups', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  deptId: varchar('dept_id', { length: 50 }).notNull(),
  leaderUsername: varchar('leader_username', { length: 50 }),
  managerUsername: varchar('manager_username', { length: 50 }),
  memberUsernames: text('member_usernames').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | varchar(50) PK | 組代碼，例如 `grp-rd1` |
| name | varchar(100) | 組名稱 |
| deptId | varchar(50) | 所屬部門 FK |
| leaderUsername | varchar(50) | 組長帳號 |
| managerUsername | varchar(50) | 負責此組的經理帳號 |
| memberUsernames | text[] | 組員帳號陣列（不含組長） |
| createdAt | timestamp | 建立時間 |

### 2.3 users（使用者）

```typescript
export const roleEnum = pgEnum('role', [
  'ROLE_ADMIN',
  'ROLE_DIRECTOR',
  'ROLE_MANAGER',
  'ROLE_LEADER',
  'ROLE_MEMBER',
])

export const users = pgTable('users', {
  username: varchar('username', { length: 50 }).primaryKey(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('ROLE_MEMBER'),
  deptId: varchar('dept_id', { length: 50 }),
  groupId: varchar('group_id', { length: 50 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| username | varchar(50) PK | 唯一登入帳號 |
| displayName | varchar(100) | 顯示名稱 |
| passwordHash | text | bcrypt 雜湊密碼 |
| role | enum | 角色（5 種） |
| deptId | varchar(50) | 所屬部門（nullable） |
| groupId | varchar(50) | 所屬組（nullable） |
| createdAt | timestamp | 建立時間 |

### 2.4 software_info（軟體上傳資訊）

```typescript
export const softwareInfo = pgTable('software_info', {
  username: varchar('username', { length: 50 }).primaryKey(),
  hostname: varchar('hostname', { length: 200 }).notNull(),
  uploadedAt: timestamp('uploaded_at').notNull(),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| username | varchar(50) PK | 使用者帳號（每人一筆） |
| hostname | varchar(200) | 電腦主機名稱 |
| uploadedAt | timestamp | 最後上傳時間 |

> **業務規則**：每次上傳以 `upsert`（ON CONFLICT DO UPDATE）寫入，確保每人只有一筆。

### 2.5 software_entries（軟體安裝項目）

```typescript
export const softwareEntries = pgTable('software_entries', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  publisher: text('publisher'),
  installDate: text('install_date'),
  installPath: text('install_path'),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | serial PK | 自動遞增 ID |
| username | varchar(50) | 所屬使用者 |
| name | text | 軟體名稱 |
| version | text | 安裝版本 |
| publisher | text | 發行商（可空） |
| installDate | text | 安裝日期（可空，格式 YYYY-MM-DD） |
| installPath | text | 安裝路徑（可空） |

> **業務規則**：上傳時先 `DELETE WHERE username = ?`，再批次 INSERT，確保只保留最新清單。

### 2.6 vuln_cache（弱點快取）

```typescript
export const severityEnum = pgEnum('severity', [
  'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE',
])

export const vulnCache = pgTable('vuln_cache', {
  softwareKey: text('software_key').primaryKey(),
  severity: severityEnum('severity'),
  cveIds: text('cve_ids').array().notNull().default([]),
  checkedAt: timestamp('checked_at').notNull(),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| softwareKey | text PK | `"{name}\|{version}"` |
| severity | enum | 最高弱點等級 |
| cveIds | text[] | 相關 CVE 編號陣列 |
| checkedAt | timestamp | 快取寫入時間 |

> Key 格式必須透過 `buildKey()` 產生。

### 2.7 cve_entries（CVE 詳細資訊）

```typescript
export const cveEntries = pgTable('cve_entries', {
  id: serial('id').primaryKey(),
  softwareKey: text('software_key').notNull(),
  cveId: varchar('cve_id', { length: 30 }).notNull(),
  cvss: numeric('cvss', { precision: 4, scale: 1 }),
  description: text('description'),
  publishedAt: timestamp('published_at'),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | serial PK | 自動遞增 ID |
| softwareKey | text | 對應 vuln_cache PK |
| cveId | varchar(30) | CVE 編號，例如 `CVE-2024-1234` |
| cvss | numeric(4,1) | CVSS 評分 |
| description | text | CVE 說明（可空） |
| publishedAt | timestamp | CVE 發布日期（可空） |

### 2.8 scan_progress（掃描進度，單筆）

```typescript
export const scanStatusEnum = pgEnum('scan_status', [
  'IDLE', 'RUNNING', 'COMPLETED', 'CANCELLED',
])

export const scanProgress = pgTable('scan_progress', {
  id: integer('id').primaryKey().default(1),
  status: scanStatusEnum('status').notNull().default('IDLE'),
  total: integer('total').notNull().default(0),
  completed: integer('completed').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  currentSoftware: text('current_software'),
  startedAt: timestamp('started_at'),
})
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | integer PK | 固定為 1（全域單筆） |
| status | enum | 掃描狀態 |
| total | integer | 待掃描總數 |
| completed | integer | 已完成數 |
| failed | integer | 失敗數 |
| currentSoftware | text | 目前掃描中的軟體名稱 |
| startedAt | timestamp | 掃描開始時間 |

---

## 三、工具函式（`src/lib/software-key.ts`）

```typescript
// 重載 1：字串版
export function buildKey(name: string, version: string): string
// 重載 2：物件版
export function buildKey(entry: { name: string; version: string }): string

// 實作
export function buildKey(
  nameOrEntry: string | { name: string; version: string },
  version?: string,
): string {
  if (typeof nameOrEntry === 'string') {
    return `${nameOrEntry}|${version}`
  }
  return `${nameOrEntry.name}|${nameOrEntry.version}`
}
```

**規則**：所有產生 `softwareKey` 的地方必須呼叫此函式，**禁止自行拼接字串**。

---

## 四、靜態版本資料（`src/lib/known-versions.json`）

提供 10 種常見軟體的最新版本資訊，供顯示「最新版本」欄位使用。查不到時回傳 `null`。

```json
{
  "Google Chrome": "124.0.6367.208",
  "Mozilla Firefox": "126.0",
  "Microsoft Edge": "124.0.2478.105",
  "7-Zip": "24.06",
  "VLC media player": "3.0.21",
  "Zoom": "6.0.11",
  "Slack": "4.38.125",
  "Visual Studio Code": "1.89.1",
  "Notepad++": "8.6.5",
  "WinRAR": "7.00"
}
```

---

## 五、Seed 資料（`src/lib/db/seed.ts`）

執行方式：`pnpm db:seed`（透過 `tsx` 直接執行 TypeScript）

### 5.1 組織結構

```
dept-rd（研發部）
  ├── directorUsername: director1
  ├── managerUsernames: [manager1, manager2]
  ├── grp-rd1（研發一組）
  │   ├── leaderUsername: leader1
  │   ├── managerUsername: manager1
  │   └── memberUsernames: [vik, bob, alice]
  └── grp-rd2（研發二組）
      ├── leaderUsername: leader2
      ├── managerUsername: manager2
      └── memberUsernames: [david, eve]

dept-sys（系統部）
  ├── directorUsername: director2
  ├── managerUsernames: [manager3]
  └── grp-sys1（系統一組）
      ├── leaderUsername: leader3
      ├── managerUsername: manager3
      └── memberUsernames: [user1, user2]
```

### 5.2 測試帳號

密碼以 `bcrypt.hash(password, 12)` 雜湊後儲存。

| 帳號 | 密碼 | 角色 | deptId | groupId |
|------|------|------|--------|---------|
| admin | Admin@123 | ROLE_ADMIN | null | null |
| director1 | Test@123 | ROLE_DIRECTOR | dept-rd | null |
| director2 | Test@123 | ROLE_DIRECTOR | dept-sys | null |
| manager1 | Test@123 | ROLE_MANAGER | dept-rd | null |
| manager2 | Test@123 | ROLE_MANAGER | dept-rd | null |
| manager3 | Test@123 | ROLE_MANAGER | dept-sys | null |
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

### 5.3 Seed 執行邏輯

1. 插入前先清除既有資料（順序：`cve_entries` → `vuln_cache` → `scan_progress` → `software_entries` → `software_info` → `users` → `groups` → `departments`）
2. 插入部門（2 筆）
3. 插入組（3 筆）
4. 插入使用者（16 筆，密碼先 hash）
5. 插入初始 `scan_progress`（id=1, status='IDLE'）
6. 每步驟 `console.log` 進度

---

## 六、Drizzle 設定（`drizzle.config.ts`）

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```
