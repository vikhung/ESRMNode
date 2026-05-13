# ESRM 報表設計文件
# 06 — CSV / Excel 報表

**對應步驟**：步驟十  
**前置文件**：`04-software.md`

---

## 一、報表 Server Actions（`src/lib/actions/report.ts`）

### 1.1 getReportData(scope, scopeId, session)

```typescript
type ReportScope = 'personal' | 'group' | 'dept' | 'all'

interface ReportRow {
  username: string
  displayName: string
  deptName: string
  groupName: string
  hostname: string
  uploadedAt: string       // ISO 格式
  softwareName: string
  installedVersion: string
  latestVersion: string    // 從 known-versions.json，查不到為 '-'
  publisher: string
  installDate: string
  hasVuln: '有' | '無' | '尚未查詢'
  maxSeverity: string      // CRITICAL / HIGH / MEDIUM / LOW / '-'
  cveList: string          // 逗號分隔，例如 "CVE-2024-1,CVE-2024-2"
  maxCvss: string          // 例如 "9.8"，無則為 '-'
  checkedAt: string        // 弱點查詢時間，無則為 '-'
}
```

權限驗證規則：
| scope | 最低角色 | scopeId 驗證 |
|-------|---------|-------------|
| personal | 任何已登入 | 必須等於 session.user.username |
| group | ROLE_LEADER | 必須等於 session.user.groupId |
| dept | ROLE_MANAGER | 必須等於 session.user.deptId |
| all | ROLE_ADMIN | 不需要 scopeId |

ROLE_ADMIN 可存取任何 scope 的任何 scopeId。

### 1.2 generateCsv(rows: ReportRow[]): Buffer

使用 `csv-stringify`：
- 標頭列（繁體中文欄位名）
- BOM 前置（`﻿`），確保 Excel 開啟時正確顯示中文
- 編碼：UTF-8

標頭對應：
| 欄位 | CSV 標頭 |
|------|---------|
| username | 使用者帳號 |
| displayName | 顯示名稱 |
| deptName | 部門 |
| groupName | 組別 |
| hostname | 主機名稱 |
| uploadedAt | 最後上傳時間 |
| softwareName | 軟體名稱 |
| installedVersion | 安裝版本 |
| latestVersion | 最新版本 |
| publisher | 發行商 |
| installDate | 安裝日期 |
| hasVuln | 是否有弱點 |
| maxSeverity | 最高弱點等級 |
| cveList | CVE 清單 |
| maxCvss | 最高 CVSS 評分 |
| checkedAt | 弱點查詢時間 |

### 1.3 generateExcel(rows: ReportRow[], title: string): Promise\<Buffer\>

使用 ExcelJS：

#### Sheet 1：詳細清單

- 第一列：報表標題（合併儲存格，粗體，字型大小 14）
- 第二列：欄位標頭（粗體，背景色 `#2563EB`，文字白色）
- 資料列：依 hasVuln / maxSeverity 上色
  | maxSeverity | 背景色 |
  |------------|--------|
  | CRITICAL | `#FEE2E2`（淡紅） |
  | HIGH | `#FFEDD5`（淡橘） |
  | MEDIUM | `#FEFCE8`（淡黃） |
  | LOW | `#DBEAFE`（淡藍） |
  | 無弱點 | 無背景色 |
  | 尚未查詢 | `#F3F4F6`（淡灰） |
- 欄寬自動調整（依內容最長字串）
- 凍結第二列（欄位標頭固定）

#### Sheet 2：統計摘要

| 欄位 | 說明 |
|------|------|
| 報表產生時間 | NOW() |
| 總軟體筆數 | rows.length |
| 唯一使用者數 | distinct username 數量 |
| CRITICAL 數量 | severity = CRITICAL 的筆數 |
| HIGH 數量 | severity = HIGH 的筆數 |
| MEDIUM 數量 | severity = MEDIUM 的筆數 |
| LOW 數量 | severity = LOW 的筆數 |
| 無弱點數量 | severity = NONE 的筆數 |
| 尚未查詢數量 | severity = null 的筆數 |

---

## 二、報表下載 API（`src/app/api/report/route.ts`）

```
GET /api/report?scope={scope}&scopeId={scopeId}&format={csv|excel}
```

處理流程：
1. 驗證 session
2. 解析 query 參數：`scope`, `scopeId`, `format`
3. 呼叫 `getReportData(scope, scopeId, session)` 取得資料
4. 依 format 呼叫 `generateCsv()` 或 `generateExcel()`
5. 設定適當的回應標頭並串流輸出

回應標頭：
```
CSV:   Content-Type: text/csv; charset=utf-8
       Content-Disposition: attachment; filename="esrm-report-{date}.csv"

Excel: Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
       Content-Disposition: attachment; filename="esrm-report-{date}.xlsx"
```

日期格式：`YYYYMMDD-HHmmss`，例如 `esrm-report-20260513-103000.xlsx`

---

## 三、報表頁面（`src/app/report/page.tsx`）

### 3.1 頁面結構

```
┌─────────────────────────────────────────────────────┐
│ 報表下載                                             │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 個人報表                                         │ │
│ │ 帳號：vik | 最後上傳：2026-05-13               │ │
│ │                    [⬇ CSV] [⬇ Excel]            │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 組別報表（依 session.user.groupId 顯示）          │ │
│ │ 研發一組（3 人）                                 │ │
│ │                    [⬇ CSV] [⬇ Excel]            │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│（以下卡片依角色顯示）                                │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 部門報表（MANAGER 以上）                          │ │
│ │ 研發部（15 人）                                  │ │
│ │                    [⬇ CSV] [⬇ Excel]            │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 全公司報表（ADMIN 限定）                          │ │
│ │ 全體員工（48 人）                                │ │
│ │                    [⬇ CSV] [⬇ Excel]            │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 3.2 下載行為

點擊下載按鈕時：
1. 開啟新視窗（`window.open('/api/report?...')`）或建立隱藏 `<a>` 並觸發點擊
2. 顯示 Loading 狀態（按鈕 disable + spinner）
3. 若 API 回傳錯誤（非 200），顯示 `toast.error('下載失敗')`

### 3.3 依角色顯示的報表卡片

| 角色 | 可見卡片 |
|------|---------|
| ROLE_MEMBER | 個人報表 |
| ROLE_LEADER | 個人報表、組別報表 |
| ROLE_MANAGER | 個人報表、部門報表 |
| ROLE_DIRECTOR | 個人報表、部門報表 |
| ROLE_ADMIN | 個人報表、全公司報表 |
