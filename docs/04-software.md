# ESRM 軟體清單設計文件
# 04 — 軟體上傳、查看頁面、儀表板統計

**對應步驟**：步驟七、步驟八  
**前置文件**：`01-data-model.md`、`02-security-auth.md`

---

## 一、軟體 Server Actions（`src/lib/actions/software.ts`）

### 1.1 parseAgentJson(raw: string): AgentPayload

格式驗證函式（非 Server Action，普通函式）：

```typescript
interface AgentPayload {
  generatedAt: string
  hostname: string
  username: string
  softwares: Array<{
    name: string
    version: string
    publisher?: string
    installDate?: string
    installPath?: string
  }>
}
```

驗證規則：
1. 頂層必須有 `generatedAt`、`hostname`、`username`、`softwares`
2. `softwares` 必須是陣列（可為空）
3. 每筆 software 的 `name` 與 `version` 必須是非空字串
4. 格式不符時拋出 `Error('無效的掃描檔案格式')`

### 1.2 saveSoftwareInfo(username: string, payload: AgentPayload)

```
'use server'
驗證 session（任何已登入角色）
```

執行步驟：
1. Upsert `software_info`（username PK，ON CONFLICT UPDATE hostname, uploadedAt）
2. `DELETE FROM software_entries WHERE username = ?`
3. 批次 `INSERT INTO software_entries`（每筆軟體一條記錄）

### 1.3 getSoftwareForUser(targetUsername: string)

```
'use server'
驗證 session
若 session.user.username !== targetUsername 且 !hasRole(session, 'ROLE_LEADER')
  → throw '權限不足'
```

查詢：
```sql
SELECT se.*, vc.severity, vc.cve_ids, vc.checked_at,
       si.hostname, si.uploaded_at
FROM software_entries se
LEFT JOIN software_info si ON si.username = se.username
LEFT JOIN vuln_cache vc ON vc.software_key = (se.name || '|' || se.version)
WHERE se.username = ?
ORDER BY se.name
```

### 1.4 getSoftwareForGroup(groupId: string)

```
'use server'
驗證 session hasRole ROLE_LEADER
```

權限檢查：
- ROLE_LEADER：`session.user.groupId === groupId`
- ROLE_MANAGER/DIRECTOR：部門匹配
- ROLE_ADMIN：無限制

查詢：
1. 查詢 `groups.memberUsernames`（含 leaderUsername）
2. 查詢上述使用者的 `software_entries` + join `vuln_cache`、`software_info`
3. 依使用者分組回傳

回傳型別：
```typescript
interface GroupSoftwareResult {
  username: string
  displayName: string
  hostname?: string
  uploadedAt?: Date
  entries: SoftwareEntryWithVuln[]
}[]
```

### 1.5 getSoftwareForDept(deptId: string)

```
'use server'
驗證 hasRole ROLE_MANAGER
```

權限檢查：
- ROLE_MANAGER/DIRECTOR：`session.user.deptId === deptId`
- ROLE_ADMIN：無限制

邏輯：查詢部門下所有組的所有成員（含組長），再查詢軟體 + 弱點

### 1.6 getSoftwareAll()

```
'use server'
驗證 session.user.role === 'ROLE_ADMIN'
```

查詢全公司所有使用者的軟體，依部門 → 組 → 使用者排序。

### 1.7 回傳型別

```typescript
interface SoftwareEntryWithVuln {
  id: number
  username: string
  name: string
  version: string
  publisher?: string
  installDate?: string
  installPath?: string
  latestVersion?: string     // 從 known-versions.json 查詢
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | null
  cveIds?: string[]
  checkedAt?: Date
}
```

`latestVersion` 由 Server Action 查詢 `known-versions.json`，查不到則為 `null`。

---

## 二、軟體上傳 API（`src/app/api/software/upload/route.ts`）

```
POST /api/software/upload
Content-Type: multipart/form-data
Body: file（JSON 檔案）
```

處理流程：
1. 驗證 session（任何已登入使用者）
2. 使用原生 `request.formData()` 取得檔案
3. 限制檔案大小 < 10MB（若超過回傳 400）
4. 讀取檔案內容，呼叫 `parseAgentJson()` 驗證格式
5. 驗證 payload.username 必須等於 session.user.username（防止冒用他人帳號上傳）
6. 呼叫 `saveSoftwareInfo()`
7. 回傳 `{ success: true, count: softwares.length }`

錯誤回應：
- `400 { error: '無效的掃描檔案格式' }`
- `400 { error: '帳號不符' }`
- `413 { error: '檔案超過 10MB 限制' }`

---

## 三、Agent 下載 API（`src/app/api/software/agent/route.ts`）

```
GET /api/software/agent
```

- 驗證 session（任何已登入使用者）
- 回傳 `public/agent/esrm-agent.ps1` 檔案
- 設定 header：`Content-Disposition: attachment; filename="esrm-agent.ps1"`
- 設定 header：`Content-Type: text/plain; charset=utf-8`

---

## 四、我的軟體頁面（`src/app/software/my/page.tsx`）

### 4.1 頁面結構

```
┌─────────────────────────────────────────────────────┐
│ 我的軟體清單                                          │
│                                                     │
│ ┌──────────┬───────────────┬──────────────────────┐ │
│ │ 軟體數量  │ 有弱點套數     │ 最後上傳時間          │ │
│ │ 42 套    │ 3 套           │ 2026-05-13 10:30     │ │
│ └──────────┴───────────────┴──────────────────────┘ │
│                                                     │
│ 主機：DESKTOP-ABCD123                               │
│                                                     │
│ [選擇 JSON 上傳] [下載掃描腳本]                       │
│                                                     │
│ ┌──────────┬───────────┬──────────┬───────────────┐ │
│ │ 軟體名稱  │ 安裝版本   │ 最新版本  │ 弱點狀態      │ │
│ ├──────────┼───────────┼──────────┼───────────────┤ │
│ │ Chrome   │ 124.0...  │ 124.0... │ [HIGH]        │ │
│ │ > CVE 詳情展開...                                │ │
│ │ Firefox  │ 125.0     │ 126.0    │ [無弱點]       │ │
│ └──────────┴───────────┴──────────┴───────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 4.2 上傳表單

- `<input type="file" accept=".json">` 選取檔案
- 送出後呼叫 POST `/api/software/upload`
- 上傳中顯示 Loading 狀態
- 成功後 `toast.success('上傳成功，共 N 筆軟體')` + 重新整理頁面
- 失敗後 `toast.error(錯誤訊息)`

### 4.3 CVE 展開列

點擊軟體列展開詳情：
```
▼ Google Chrome | 124.0.6367.82
  CVE 編號        CVSS   說明                     發布日期
  CVE-2024-1234   9.8    Use-after-free in...     2024-03-15
  CVE-2024-5678   7.5    Out-of-bounds read...    2024-04-01
```

### 4.4 弱點狀態徽章

| 狀態 | 樣式 |
|------|------|
| CRITICAL | `bg-red-600 text-white` |
| HIGH | `bg-orange-500 text-white` |
| MEDIUM | `bg-yellow-400 text-gray-900` |
| LOW | `bg-blue-400 text-white` |
| NONE（無弱點） | `bg-green-500 text-white` |
| null（尚未查詢） | `bg-gray-300 text-gray-700` |

---

## 五、組軟體清單（`src/app/software/group/[groupId]/page.tsx`）

### 5.1 頁面結構

- 標題：「{組名稱} — 軟體清單」
- 統計卡片：組員人數、已上傳人數、有弱點套數
- 以人員為單位展開/折疊的軟體列表
  ```
  ▼ vik（DESKTOP-VIK，最後上傳 2026-05-13）
    [Chrome, HIGH][Firefox, 無弱點]...
  ▼ bob（DESKTOP-BOB，最後上傳 2026-05-12）
    ...
  ```
- 尚未上傳的組員顯示「尚未上傳」提示

### 5.2 存取控制

- `groupId` 必須等於 `session.user.groupId`（ROLE_LEADER）
- ROLE_MANAGER/DIRECTOR/ADMIN 可存取屬於自己部門的任何組

---

## 六、部門軟體清單（`src/app/software/dept/[deptId]/page.tsx`）

- 標題：「{部門名稱} — 軟體清單」
- 統計卡片：部門人數、已上傳人數、有弱點套數
- 以組為單位分組展示（同組軟體清單格式）
- `deptId` 必須等於 `session.user.deptId`（ROLE_MANAGER/DIRECTOR）
- ROLE_ADMIN 可存取所有部門

---

## 七、全公司軟體清單（`src/app/software/all/page.tsx`）

- 僅 ROLE_ADMIN 可存取
- 標題：「全公司軟體清單」
- 以部門 → 組的層級展示
- 頂部統計：公司總人數、已上傳人數、有弱點套數、弱點最嚴重等級

---

## 八、儀表板統計（`src/app/dashboard/page.tsx`）

### 8.1 各角色顯示卡片

**ROLE_MEMBER**
| 卡片 | 資料來源 |
|------|---------|
| 我的軟體套數 | `COUNT(software_entries WHERE username)` |
| 有弱點套數 | join vuln_cache 計算非 NONE 且非 null 的數量 |
| 最後上傳時間 | `software_info.uploadedAt` |

**ROLE_LEADER**
| 卡片 | 資料來源 |
|------|---------|
| 本組人數 | `LENGTH(groups.memberUsernames)` + 1（含組長） |
| 已上傳人數 | `COUNT DISTINCT(software_info.username)` WHERE 在組內 |
| 有弱點套數 | 組內所有軟體中，有弱點的唯一 softwareKey 數量 |

**ROLE_MANAGER / ROLE_DIRECTOR**
| 卡片 | 資料來源 |
|------|---------|
| 部門人數 | 部門下所有組的成員數加總（含組長） |
| 已上傳人數 | 部門內有 software_info 的人數 |
| 有弱點套數 | 部門內所有軟體中，有弱點的唯一 softwareKey 數量 |

**ROLE_ADMIN**
| 卡片 | 資料來源 |
|------|---------|
| 全公司員工數 | `COUNT(users)` |
| 已上傳人數 | `COUNT(software_info)` |
| 有弱點軟體套數 | `COUNT(vuln_cache WHERE severity != 'NONE')` |
| 弱點最後掃描時間 | `scan_progress.startedAt`（最近一次 COMPLETED 的時間） |

### 8.2 統計查詢實作建議

統計查詢以單一 SQL 完成（使用 Drizzle aggregation），避免 N+1 查詢。
