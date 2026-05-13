# ESRM 開發指南：使用 Claude Code 逐步產生程式碼

---

## 如何使用本指南

本指南將開發過程拆分為 **11 個步驟**。每個步驟包含：
- **本步驟目標**：說明要完成什麼
- **指令**：複製貼入 Claude Code 即可執行
- **驗證**：完成後的測試方式

> **原則**：每次只給 Claude Code 一個步驟。確認功能正常後再繼續下一步。
> 若遇到錯誤，直接把錯誤訊息貼給 Claude Code 請它修正。

---

## 文件索引

| 文件 | 說明 |
|------|------|
| `00.SA-requirements.md` | 系統需求分析（SA）—— 功能需求、角色、業務規則（不含技術細節） |
| `00.SD-design.md` | 系統設計（SD）—— 技術架構、元件設計、設定規格 |
| `01-data-model.md` | Drizzle Schema、資料表設計、seed 資料 |
| `02-security-auth.md` | NextAuth.js、登入頁、共用版面 |
| `03-org-admin.md` | 組織 CRUD、使用者管理、Admin 頁面 |
| `04-software.md` | 軟體上傳、查看頁面、儀表板統計 |
| `05-vuln.md` | NVD API 弱點查詢、掃描進度 |
| `06-report.md` | CSV / Excel 報表 |
| `07-agent-and-checklist.md` | esrm-agent.ps1 完整版、整合驗收、部署說明 |

---

## 開發前置準備

執行以下指令確認環境就緒：

```bash
node -v     # 需要 Node.js 20 LTS 以上
pnpm -v     # 需要 pnpm 9.x 以上
```

建立 `.env.local` 並填入資料庫連線（參考 `docs/00.SD-design.md` 第七節）。

---

## 步驟一：建立專案骨架

**目標**：建立 Next.js 專案結構與設定檔，尚不需要任何業務邏輯。

### 指令

```
請閱讀 docs/00.SD-design.md，建立 ESRM Next.js 專案骨架。

需建立以下檔案：
1. package.json
   - 依照「八、package.json 主要依賴」加入所有依賴
   - scripts 加入 dev, build, typecheck, lint, test, db:generate, db:migrate, db:push, db:studio, db:seed
2. next.config.ts
3. tailwind.config.ts（Tailwind 4.x）
4. tsconfig.json（strict mode，路徑別名 @/ → src/）
5. drizzle.config.ts（指向 DATABASE_URL，dialect: postgresql）
6. middleware.ts（暫時只做 pass-through，後續步驟填實作）
7. src/app/layout.tsx（根 Layout）
8. src/app/page.tsx（redirect 到 /dashboard）
9. .gitignore（含 .env.local、.next/、node_modules/）
10. 建立所有空目錄：
    src/app/login/, src/app/dashboard/, src/app/software/, src/app/admin/,
    src/app/vuln/, src/app/report/, src/app/api/,
    src/components/ui/, src/components/layout/, src/components/software/,
    src/components/admin/, src/components/vuln/,
    src/lib/db/, src/lib/actions/, public/agent/

此步驟只建立骨架，不需要任何業務邏輯。
```

### 驗證

```bash
pnpm install
pnpm typecheck   # 應成功，無型別錯誤
pnpm build       # 應成功
```

---

## 步驟二：資料庫 Schema 與連線

**目標**：建立 Drizzle Schema 與 Neon 連線，以及測試資料 seed 腳本。

### 指令

```
步驟一已完成，pnpm build 無錯誤。
請閱讀 docs/00.SD-design.md 與 docs/01-data-model.md，建立資料層所有類別。

需建立以下檔案：

【資料庫連線】
- src/lib/db/index.ts（Drizzle + @neondatabase/serverless，從 DATABASE_URL 連線）

【Schema 定義】
- src/lib/db/schema.ts（依文件定義的所有資料表：
  departments, groups, users, software_info, software_entries,
  vuln_cache, cve_entries, scan_progress）

【工具函式與靜態資料】
- src/lib/software-key.ts（buildKey() 兩個重載）
- src/lib/known-versions.json（10 種常見軟體最新版本，弱點查詢輔助）

【Seed 資料】
- src/lib/db/seed.ts（插入預設組織結構與測試帳號，密碼以 bcrypt hash 儲存）
  測試帳號清單：admin/Admin@123, director1/Test@123, director2/Test@123,
  manager1~3/Test@123, leader1~3/Test@123,
  vik/bob/alice/david/eve/user1/user2（均為 Test@123）
  組織結構：dept-rd（grp-rd1, grp-rd2）、dept-sys（grp-sys1）
```

### 驗證

```bash
pnpm db:push     # Schema 推送至 Neon，確認資料表已建立
pnpm db:seed     # 插入測試資料
pnpm db:studio   # 開啟 Drizzle Studio，確認資料正確
```

---

## 步驟三：NextAuth.js 認證與共用版面

**目標**：實作登入功能、角色權限規則、共用頁面版面。

### 指令

```
步驟二已完成，資料表與測試資料正常。
請閱讀 docs/00.SD-design.md 與 docs/02-security-auth.md，建立認證模組與共用版面。

需建立以下檔案：
1. src/lib/auth.ts
   - NextAuth Credentials Provider（查 DB → bcrypt 比對 → 回傳 session）
   - EsrmSession 型別定義
   - hasRole(session, minRole) 輔助函式
2. middleware.ts（完整版）
   - 未登入 → redirect /login
   - /admin/* 需要 ROLE_ADMIN，否則呼叫 forbidden()
   - /vuln/* 需要 ROLE_ADMIN，否則呼叫 forbidden()
   - /software/* 只需登入（群組/部門的擁有者驗證在 Server Action 內處理）
3. src/app/api/auth/[...nextauth]/route.ts
4. src/app/login/page.tsx（置中卡片，含登入失敗訊息）
5. src/components/layout/navbar.tsx（系統名稱、登入者、登出按鈕）
6. src/components/layout/sidebar.tsx（依角色顯示選單）
7. src/app/layout.tsx（更新，加入 Navbar + Sidebar）

shadcn/ui 元件使用：Card、Button、Input、Label、Toast（Sonner）。
```

### 驗證

```bash
pnpm dev
```

- [ ] 開啟 `http://localhost:3000/login`，出現登入頁
- [ ] 以 `vik / Test@123` 登入成功，導向儀表板（暫時空白頁）
- [ ] 以錯誤密碼登入，顯示錯誤訊息
- [ ] 直接訪問 `/admin/org` 被導向登入頁（未登入）

---

## 步驟四：儀表板與錯誤頁面

**目標**：完成登入後的儀表板（先用佔位資料），以及 403、404 錯誤頁。

### 指令

```
步驟三已完成，登入/登出功能正常。
請閱讀 docs/00.SD-design.md 與 docs/02-security-auth.md 的儀表板與錯誤頁章節，建立以下頁面。

需建立以下檔案：
1. src/app/dashboard/page.tsx
   - 從 auth() 取得 session
   - 依角色顯示不同統計卡片（目前先用靜態假資料）
   - ADMIN 卡片：全公司人數、已上傳人數、有弱點套數、最後掃描時間
   - DIRECTOR/MANAGER 卡片：部門人數、已上傳人數、弱點套數
   - LEADER 卡片：本組人數、已上傳人數、弱點套數
   - MEMBER 卡片：個人軟體套數、有弱點套數、最後上傳時間
2. src/app/not-found.tsx（404 頁面）
3. src/app/forbidden.tsx（Next.js 15 內建 403 頁面，搭配 middleware 的 forbidden() 呼叫）

使用 shadcn/ui Card 元件。
```

### 驗證

- [ ] 各角色登入後，Sidebar 選單依角色正確顯示/隱藏
- [ ] 以 `admin` 登入，看到 Admin 版儀表板卡片
- [ ] 以 `vik` 登入，看到 Member 版儀表板卡片
- [ ] 直接輸入 `/admin/org`（以非 admin 帳號），顯示 `/forbidden` 頁面

---

## 步驟五：組織管理

**目標**：Admin 可對部門、組、成員進行完整的 CRUD 操作。

### 指令

```
步驟四已完成，儀表板與錯誤頁正常。
請閱讀 docs/00.SD-design.md 與 docs/03-org-admin.md，建立組織管理功能。

需建立以下檔案：
1. src/lib/actions/org.ts（Server Actions）
   - getDepartments(), getGroups(deptId)
   - createDepartment(), updateDepartment(), deleteDepartment()
   - createGroup(), updateGroup(), deleteGroup()
   - addMember(), removeMember()
   - 驗證規則：刪除部門前需無組、刪除組前需無組員、同帳號不可加入兩個組
2. src/app/admin/org/page.tsx
   - 左側部門清單 + 右側詳細（組、成員）
   - 新增/編輯使用 shadcn/ui Dialog（不跳頁）
   - 刪除使用 AlertDialog 確認
   - Toast 顯示成功/失敗訊息

所有 Server Action 必須在函式頂部驗證 session 且 role === ROLE_ADMIN。
```

### 驗證

- [ ] 以 `admin` 登入，進入 `/admin/org`
- [ ] 新增部門「測試部」，重新整理後出現在清單
- [ ] 在測試部下新增組「測試組」
- [ ] 新增組員 `vik` 到測試組
- [ ] 嘗試刪除有組的部門，應顯示錯誤
- [ ] 嘗試將 `vik` 加入第二個組，應顯示錯誤

---

## 步驟六：使用者管理

**目標**：Admin 可建立、編輯、刪除使用者帳號。

### 指令

```
步驟五已完成，組織管理功能正常。
請閱讀 docs/00.SD-design.md 與 docs/03-org-admin.md 的使用者管理章節，建立使用者管理功能。

需建立以下檔案：
1. src/lib/actions/users.ts（Server Actions）
   - getUsers(), createUser(), updateUser(), resetPassword(), deleteUser()
   - 密碼以 bcrypt hash 儲存（saltRounds: 12）
2. src/app/admin/users/page.tsx
   - 使用者清單表格（帳號、顯示名稱、角色、部門、組）
   - 新增/編輯使用 Dialog
   - 重設密碼功能
   - Toast 顯示操作結果
```

### 驗證

- [ ] 以 `admin` 登入，進入 `/admin/users`，看到所有測試帳號
- [ ] 新增一個新帳號，可用新帳號登入
- [ ] 重設密碼後，舊密碼失效

---

## 步驟七：軟體清單

**目標**：實作軟體上傳、查看，以及 esrm-agent.ps1 初版。

### 指令

```
步驟六已完成，使用者管理功能正常。
請閱讀 docs/00.SD-design.md 與 docs/04-software.md，建立軟體清單功能。

需建立以下檔案：
1. src/lib/actions/software.ts（Server Actions）
   - saveSoftwareInfo()：upsert software_info + 刪舊插新 software_entries
   - getSoftwareForUser(), getSoftwareForGroup(), getSoftwareForDept(), getSoftwareAll()
   - 每個 get 方法都要 join vuln_cache 合併弱點資訊
   - parseAgentJson()：解析 esrm-agent 輸出 JSON（格式規格見 docs/00.SD-design.md 第九節）
2. src/app/api/software/upload/route.ts
   - POST 接收 multipart/form-data，使用原生 request.formData() 解析（不用 formidable）
   - 檔案大小限制 < 10MB，呼叫 parseAgentJson() 驗證格式後存入 DB
3. src/app/api/software/agent/route.ts
   - GET 回傳 public/agent/esrm-agent.ps1
4. src/app/software/my/page.tsx
   - 顯示最後更新時間、主機名稱、統計卡片
   - 上傳表單（accept=".json"）+ 下載 agent 按鈕
   - 軟體清單表格（名稱、版本、弱點狀態徽章、最新版本）
   - 點擊列展開 CVE 詳情
5. src/app/software/group/[groupId]/page.tsx
6. src/app/software/dept/[deptId]/page.tsx
7. src/app/software/all/page.tsx
8. public/agent/esrm-agent.ps1（基本版，步驟十一會更新為完整版）
   注意：public/ 在專案根目錄（與 src/ 同層），不在 src/ 內

弱點狀態徽章顏色依照 00.SD-design.md 第十節的色彩規範。
```

### 驗證

- [ ] 以 `vik` 登入，進入 `/software/my`，看到「尚未上傳」提示
- [ ] 點擊下載 esrm-agent.ps1，檔案可正常下載
- [ ] 以 `leader1` 登入，進入 `/software/group/grp-rd1`，看到組員清單
- [ ] 以 `leader1` 嘗試訪問 `/software/group/grp-rd2`，應被拒絕

---

## 步驟八：儀表板統計更新

**目標**：將儀表板由假資料改為從資料庫讀取的真實統計。

### 指令

```
步驟七已完成，軟體清單頁面正常。
請閱讀 docs/04-software.md 的儀表板統計章節，更新儀表板頁面。

修改以下檔案：
1. src/app/dashboard/page.tsx
   - 從 DB 查詢真實統計數字
   - MEMBER：個人軟體數、有弱點數、最後上傳時間
   - LEADER：本組人數、已上傳人數、弱點數
   - MANAGER/DIRECTOR：本部門人數、已上傳人數、弱點數
   - ADMIN：全公司人數、已上傳人數、弱點數、最後掃描時間
```

### 驗證

- [ ] 上傳 vik 的軟體 JSON 後，儀表板個人軟體數正確更新
- [ ] 以 leader1 登入，本組已上傳人數正確顯示

---

## 步驟九：弱點查詢

**目標**：實作 NVD API 批次弱點查詢，含進度顯示與快取機制。

### 指令

```
步驟八已完成，儀表板統計正確。
請閱讀 docs/00.SD-design.md 與 docs/05-vuln.md，建立弱點查詢功能。

需建立以下檔案：
1. src/app/api/vuln/scan/route.ts
   - POST start：初始化 scan_progress（status: RUNNING, total: N），回傳立即
   - POST batch：處理一批次（5 筆）NVD 查詢，更新 scan_progress
   - POST cancel：更新狀態為 CANCELLED
2. src/app/api/vuln/progress/route.ts
   - GET：回傳 scan_progress 目前狀態（JSON）
3. src/app/vuln/scan/page.tsx
   - 顯示：待查詢軟體數、API Key 狀態、預估時間
   - 啟動/取消掃描按鈕
   - 進度條（shadcn/ui Progress）
   - 前端每 2 秒輪詢 /api/vuln/progress
4. src/lib/known-versions.json（10 種常見軟體最新版本）

掃描間隔：有 API Key 時 700ms；無 API Key 時 6000ms。
```

### 驗證

- [ ] 進入 `/vuln/scan`，顯示待查詢軟體數
- [ ] 啟動掃描，進度條即時更新
- [ ] 掃描完成後，DB 的 `vuln_cache` 表有資料
- [ ] 重複掃描，TTL 有效時不重複呼叫 API
- [ ] 取消掃描功能正常

---

## 步驟十：報表

**目標**：提供 CSV 與 Excel 格式的軟體風險報表。

### 指令

```
步驟九已完成，弱點查詢功能正常。
請閱讀 docs/06-report.md，建立報表功能。

需建立以下檔案：
1. src/lib/actions/report.ts
   - getReportData(scope, scopeId, session)：驗證角色後取得對應範圍軟體資料
   - generateCsv()：使用 csv-stringify 產生 CSV Buffer
   - generateExcel()：使用 ExcelJS 產生 Excel Buffer
     - Sheet 1「詳細清單」：所有報表欄位，弱點列依嚴重程度上色
     - Sheet 2「統計摘要」：各弱點等級數量統計
2. src/app/api/report/route.ts
   - GET?scope=personal|group|dept|all&scopeId=xxx&format=csv|excel
   - 驗證 session 與角色擁有權後回傳串流下載
3. src/app/report/page.tsx
   - 依角色顯示可用的報表範圍（MEMBER 只見個人；LEADER 見本組+個人）
   - CSV / Excel 格式選擇按鈕
   - 點擊後觸發瀏覽器下載
```

### 驗證

- [ ] 以 `vik` 登入，只看到個人報表選項
- [ ] 下載個人 CSV，欄位正確
- [ ] 下載個人 Excel，有兩個工作表，有弱點列有顏色
- [ ] 以 `leader1` 嘗試下載 `grp-rd2` 的報表，應被拒絕

---

## 步驟十一：esrm-agent 完整版 + 整合驗收

**目標**：更新掃描腳本為正式版，並逐項執行整合驗收測試。

### 指令

```
步驟十已完成，報表功能正常。
請閱讀 docs/07-agent-and-checklist.md，完成最後工作：

1. 更新 public/agent/esrm-agent.ps1 為完整版
   - 依照文件腳本規格（含 Set-StrictMode、去重邏輯、SystemComponent 過濾、
     UTF-8 without BOM 輸出、上傳至系統 API 的邏輯）
   - 輸出格式須符合 docs/00.SD-design.md 第九節規格

2. 執行整合驗收測試（依文件清單，有問題直接修正）
```

### 完整驗收清單

**認證與角色**
- [ ] 所有測試帳號均可正常登入
- [ ] 密碼錯誤顯示錯誤，不洩漏帳號是否存在
- [ ] 登出後重新訪問任何頁面均導向登入頁
- [ ] 角色階層生效（ADMIN 可存取所有頁面）
- [ ] 無權限 URL 顯示 forbidden 頁面

**組織管理**
- [ ] 新增/編輯/刪除部門、組、成員
- [ ] 刪除有組的部門顯示錯誤
- [ ] 同帳號不可加入兩個組

**使用者管理**
- [ ] 新增/編輯/刪除使用者
- [ ] 重設密碼後舊密碼失效

**軟體清單**
- [ ] 上傳軟體 JSON，清單正確顯示
- [ ] 重複上傳，舊資料被覆蓋
- [ ] 各角色只能看到對應範圍
- [ ] 無弱點快取時顯示「尚未查詢」

**弱點查詢**
- [ ] 掃描進度即時更新
- [ ] TTL 快取有效
- [ ] 取消掃描正常
- [ ] 掃描後軟體清單顯示弱點狀態

**報表**
- [ ] CSV/Excel 格式正確
- [ ] Excel 有兩個 Sheet 且弱點列有顏色
- [ ] 權限範圍正確（組長無法下載其他組）

---

## 除錯提示

| 症狀 | 排查方向 |
|------|----------|
| NextAuth 登入失敗 | 確認 `AUTH_SECRET` 已設定；Credentials callback 看 server log |
| Drizzle 找不到資料表 | 執行 `pnpm db:push` 或 `pnpm db:migrate` |
| Server Action 無效 | 確認函式最頂行有 `'use server'` |
| Middleware 無法讀取 session | 確認 `AUTH_SECRET` 在 `.env.local` 與 `auth.ts` 一致 |
| Vercel 函式 timeout | 掃描批次改小；或升級 Vercel Pro 延長 timeout |
| Neon connection 錯誤 | 確認 `DATABASE_URL` 包含 `?sslmode=require` |

---

## 部署說明

詳見 `docs/07-agent-and-checklist.md` 部署章節。快速部署：

```bash
# 1. 在 Vercel Dashboard 建立新專案，匯入 Git 儲存庫
# 2. 在 Vercel 整合中加入 Neon（自動注入 DATABASE_URL）
# 3. 在 Vercel 環境變數設定 AUTH_SECRET、NVD_API_KEY
# 4. 推送程式碼，Vercel 自動部署

# 部署後初始化資料庫
DATABASE_URL=<neon-url> pnpm db:push
DATABASE_URL=<neon-url> pnpm db:seed
```
