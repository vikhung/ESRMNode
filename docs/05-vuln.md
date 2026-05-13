# ESRM 弱點查詢設計文件
# 05 — NVD API 批次弱點查詢、掃描進度

**對應步驟**：步驟九  
**前置文件**：`01-data-model.md`、`04-software.md`

---

## 一、架構概述

Vercel Serverless Function 執行時間有限，批次掃描採「前端驅動」架構：

```
前端                          後端
 │                             │
 ├─ POST /api/vuln/scan (start) ──→ 初始化 scan_progress（RUNNING）
 │                                  回傳 { total: N }
 │
 ├─ POST /api/vuln/scan (batch) ──→ 處理 1 筆 NVD 查詢
 │    每完成 1 筆呼叫一次           更新 scan_progress.completed / failed
 │                                  回傳 { done: false }
 │
 ├─ GET  /api/vuln/progress     ──→ 回傳目前 scan_progress
 │    每 2 秒輪詢                   { status, total, completed, failed, currentSoftware }
 │
 ├─ POST /api/vuln/scan (batch) ──→ 最後一筆完成
 │                                  更新 status: COMPLETED
 │                                  回傳 { done: true }
 │
 └─ POST /api/vuln/scan (cancel) → 更新 status: CANCELLED
```

---

## 二、弱點掃描 API（`src/app/api/vuln/scan/route.ts`）

### 2.1 請求格式

```typescript
// start
POST /api/vuln/scan
{ "action": "start" }

// batch（每次處理 1 筆）
POST /api/vuln/scan
{ "action": "batch", "softwareKey": "Google Chrome|124.0.6367.82" }

// cancel
POST /api/vuln/scan
{ "action": "cancel" }
```

### 2.2 start 邏輯

```
驗證 session.user.role === 'ROLE_ADMIN'

1. 查詢所有不重複的 softwareKey（已上傳的軟體）
   SELECT DISTINCT (name || '|' || version) FROM software_entries

2. 過濾掉快取仍有效的 key（checkedAt + TTL_HOURS > NOW()）
   TTL = parseInt(process.env.VULN_CACHE_TTL_HOURS ?? '24')

3. 將待掃描清單存入 scan_progress 或以其他方式傳遞給前端
   （注意：Serverless 無共享記憶體，清單透過回應回傳給前端）

4. Upsert scan_progress（id=1）：
   status: RUNNING
   total: 待掃描數量
   completed: 0
   failed: 0
   currentSoftware: null
   startedAt: NOW()

5. 回傳：{ total: N, pendingKeys: string[] }
```

> `pendingKeys` 直接回傳給前端，前端自行維護待掃描佇列，依序呼叫 batch。

### 2.3 batch 邏輯

```
驗證 session.user.role === 'ROLE_ADMIN'
驗證 scan_progress.status === 'RUNNING'（若已 CANCELLED 則停止）

1. 更新 scan_progress.currentSoftware = softwareKey

2. 呼叫 NVD API 查詢（見第三節）

3. 解析結果 → 計算 severity（最高 CVSS 對應等級）

4. Upsert vuln_cache：
   softwareKey, severity, cveIds, checkedAt: NOW()

5. 批次 INSERT cve_entries（先 DELETE WHERE softwareKey，再 INSERT）

6. 更新 scan_progress：
   completed += 1（成功）或 failed += 1（失敗）

7. 回傳：{ success: true, severity, cveCount }
```

### 2.4 cancel 邏輯

```
驗證 ROLE_ADMIN
更新 scan_progress.status = 'CANCELLED'
回傳 { success: true }
```

---

## 三、進度查詢 API（`src/app/api/vuln/progress/route.ts`）

```
GET /api/vuln/progress
驗證 ROLE_ADMIN
查詢 scan_progress WHERE id = 1
回傳：{
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'CANCELLED',
  total: number,
  completed: number,
  failed: number,
  currentSoftware: string | null,
  startedAt: string | null
}
```

---

## 四、NVD API 查詢

### 4.1 請求規格

```
URL: process.env.NVD_API_URL + ?keywordSearch={軟體名稱}

Headers:
  apiKey: process.env.NVD_API_KEY（若有）

Response 解析重點（NVD 2.0 格式）：
  vulnerabilities[].cve.id → CVE 編號
  vulnerabilities[].cve.metrics.cvssMetricV31[0].cvssData.baseScore → CVSS 分數
  vulnerabilities[].cve.descriptions（lang=en）.value → 說明
  vulnerabilities[].cve.published → 發布日期
```

### 4.2 CVSS 分數對應等級

| CVSS 分數 | 等級 |
|-----------|------|
| 9.0 – 10.0 | CRITICAL |
| 7.0 – 8.9 | HIGH |
| 4.0 – 6.9 | MEDIUM |
| 0.1 – 3.9 | LOW |
| 無漏洞 / 0 | NONE |

若同一軟體有多個 CVE，以最高 CVSS 分數決定 severity。

### 4.3 速率控制

```typescript
const delay = process.env.NVD_API_KEY ? 700 : 6000 // ms
await new Promise(resolve => setTimeout(resolve, delay))
```

每次 batch 呼叫在查詢後等待，下一次批次呼叫時自然間隔。

### 4.4 查詢失敗處理

- 捕獲所有例外（網路錯誤、HTTP 非 200、JSON 解析失敗）
- 失敗時將 `severity = null`（即保持「尚未查詢」）
- `scan_progress.failed += 1`
- 繼續下一筆（不中斷整體掃描）

---

## 五、弱點掃描頁面（`src/app/vuln/scan/page.tsx`）

### 5.1 頁面結構

```
┌─────────────────────────────────────────────────────┐
│ 弱點掃描                                             │
│                                                     │
│ ┌──────────┬──────────────┬─────────────────────┐   │
│ │ 待掃描數量 │ API Key 狀態  │ 預估時間             │   │
│ │ 42 筆    │ ✅ 已設定      │ 約 30 秒            │   │
│ └──────────┴──────────────┴─────────────────────┘   │
│                                                     │
│ [▶ 開始掃描]   [■ 取消掃描]（掃描中才顯示）           │
│                                                     │
│ 進度：                                               │
│ ████████████░░░░░░░  62%（26/42）                   │
│ 目前：Google Chrome|124.0.6367.82                   │
│ 失敗：2 筆                                           │
│                                                     │
│ 上次掃描完成：2026-05-13 10:30:00                    │
└─────────────────────────────────────────────────────┘
```

### 5.2 前端狀態機

```
IDLE → [點擊開始] → 呼叫 start API → 取得 pendingKeys
      → RUNNING → 依序呼叫 batch（每筆呼叫完再呼叫下一筆）
                → 每 2 秒 poll progress API 更新 UI
                → pendingKeys 清空 → COMPLETED
                → [點擊取消] → 呼叫 cancel → CANCELLED
```

### 5.3 預估時間計算

```typescript
const perItemMs = process.env.NVD_API_KEY ? 700 : 6000
const estimatedSeconds = Math.ceil((pendingCount * perItemMs) / 1000)
```

### 5.4 API Key 狀態顯示

- 有設定 `NVD_API_KEY`：顯示「✅ 已設定」（快速模式）
- 未設定：顯示「⚠️ 未設定（慢速模式）」

---

## 六、快取機制說明

- **TTL 設定**：`VULN_CACHE_TTL_HOURS` 環境變數（預設 24 小時）
- **快取判斷**：`checkedAt + TTL > NOW()` 的 softwareKey 跳過，不重複查詢
- **快取更新**：每次掃描以 upsert 覆蓋既有快取（不保留舊資料）
- **快取共用**：所有使用者共用同一份弱點快取（以 softwareKey 為 PK）
