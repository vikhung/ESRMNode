# ESRM 掃描腳本、整合驗收與部署說明
# 07 — esrm-agent.ps1、整合驗收清單、部署步驟

**對應步驟**：步驟十一  
**前置文件**：`00.SD-design.md` 第九節

---

## 一、esrm-agent.ps1 完整版規格

檔案位置：`public/agent/esrm-agent.ps1`（專案根目錄的 public/ 下）

### 1.1 功能說明

1. 掃描 Windows 電腦已安裝的軟體（從登錄檔取得）
2. 去除重複項目（相同名稱 + 版本視為同一筆）
3. 過濾系統元件（SystemComponent = 1 的項目）
4. 產生 JSON 輸出（符合 docs/00.SD-design.md 第九節規格）
5. 輸出至 JSON 檔案（UTF-8 without BOM）
6. 提示使用者登入系統上傳

### 1.2 腳本內容

```powershell
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 輸出格式版本
$FormatVersion = '1.0'

# 取得當前使用者
$CurrentUser = $env:USERNAME

# 取得主機名稱
$Hostname = $env:COMPUTERNAME

# 登錄檔路徑（32 位元與 64 位元應用程式）
$RegistryPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

# 收集軟體資訊
$RawEntries = foreach ($Path in $RegistryPaths) {
    if (Test-Path $Path) {
        Get-ItemProperty -Path $Path -ErrorAction SilentlyContinue
    }
}

# 過濾與正規化
$Softwares = $RawEntries |
    Where-Object {
        # 過濾系統元件
        $_.SystemComponent -ne 1 -and
        # 必須有名稱
        $_.DisplayName -and
        $_.DisplayName.Trim() -ne '' -and
        # 必須有版本
        $_.DisplayVersion -and
        $_.DisplayVersion.Trim() -ne ''
    } |
    ForEach-Object {
        [PSCustomObject]@{
            name        = $_.DisplayName.Trim()
            version     = $_.DisplayVersion.Trim()
            publisher   = if ($_.Publisher) { $_.Publisher.Trim() } else { $null }
            installDate = if ($_.InstallDate -match '^\d{8}$') {
                              "$($_.InstallDate.Substring(0,4))-$($_.InstallDate.Substring(4,2))-$($_.InstallDate.Substring(6,2))"
                          } else { $null }
            installPath = if ($_.InstallLocation) { $_.InstallLocation.Trim() } else { $null }
        }
    } |
    # 去除重複（相同 name + version）
    Sort-Object name, version -Unique

# 建立輸出物件
$Output = [PSCustomObject]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    hostname    = $Hostname
    username    = $CurrentUser
    softwares   = @($Softwares)
}

# 輸出 JSON（UTF-8 without BOM）
$OutputPath = Join-Path $env:TEMP "esrm-scan-$CurrentUser.json"
$JsonContent = $Output | ConvertTo-Json -Depth 5 -Compress

# 使用 UTF-8 without BOM 寫入
[System.IO.File]::WriteAllText(
    $OutputPath,
    $JsonContent,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "掃描完成！共找到 $($Softwares.Count) 套軟體。" -ForegroundColor Green
Write-Host "檔案已儲存至：$OutputPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "請登入 ESRM 系統，前往「我的軟體清單」頁面上傳此檔案。" -ForegroundColor Yellow
Write-Host ""
Write-Host "按任意鍵繼續..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
```

### 1.3 執行方式

員工在 PowerShell 執行：
```powershell
# 方式一：直接執行
.\esrm-agent.ps1

# 方式二：若遭到執行原則限制
powershell.exe -ExecutionPolicy Bypass -File .\esrm-agent.ps1
```

---

## 二、整合驗收清單

### 2.1 認證與角色

- [ ] 所有測試帳號均可正常登入（admin, vik, leader1 等）
- [ ] 密碼錯誤顯示「帳號或密碼錯誤」，不透露帳號是否存在
- [ ] 登出後訪問任何頁面均導向 `/login`
- [ ] ROLE_ADMIN 可存取所有頁面（/admin/org, /admin/users, /vuln/scan）
- [ ] ROLE_MEMBER 嘗試訪問 `/admin/org` 顯示 403 forbidden 頁面
- [ ] JWT session 正確帶入 username, role, deptId, groupId

### 2.2 組織管理

- [ ] 新增部門，重新整理後出現在清單
- [ ] 修改部門名稱，即時反映
- [ ] 嘗試刪除有組的部門，顯示錯誤 Toast
- [ ] 刪除無組的部門成功
- [ ] 新增組到部門
- [ ] 嘗試刪除有成員的組，顯示錯誤 Toast
- [ ] 加入組員，vik 出現在 grp-rd1 成員清單
- [ ] 嘗試將 vik 加入第二個組，顯示錯誤 Toast
- [ ] 移除組員成功

### 2.3 使用者管理

- [ ] 使用者清單顯示所有 16 個測試帳號
- [ ] 新增新帳號，可用新帳號登入
- [ ] 修改角色後，重新登入角色已更新
- [ ] 重設密碼後，舊密碼失效，新密碼可登入
- [ ] 刪除帳號後，帳號無法登入，軟體資料一併清除

### 2.4 軟體清單

- [ ] vik 登入，進入「我的軟體清單」，顯示「尚未上傳」提示
- [ ] 下載 esrm-agent.ps1，檔案可正常開啟
- [ ] 上傳合法 JSON 檔案，清單正確顯示
- [ ] 重複上傳，舊資料被覆蓋（筆數與內容以新上傳為準）
- [ ] 上傳格式錯誤的 JSON，顯示錯誤訊息
- [ ] leader1 登入，進入 `/software/group/grp-rd1`，看到組員清單
- [ ] leader1 嘗試訪問 `/software/group/grp-rd2`，被拒絕
- [ ] manager1 登入，進入 `/software/dept/dept-rd`，看到部門清單
- [ ] admin 登入，進入 `/software/all`，看到全公司清單
- [ ] 弱點狀態徽章顯示正確顏色

### 2.5 弱點查詢

- [ ] 進入 `/vuln/scan`，顯示待查詢軟體數量
- [ ] API Key 狀態正確顯示
- [ ] 啟動掃描，進度條更新
- [ ] 掃描完成後，`vuln_cache` 表有資料
- [ ] 重複掃描，TTL 有效時跳過已快取軟體
- [ ] 取消掃描後狀態變為 CANCELLED
- [ ] 軟體清單頁面顯示弱點狀態（掃描後）

### 2.6 報表

- [ ] vik 登入，報表頁面只顯示個人報表選項
- [ ] leader1 登入，顯示個人 + 組別報表
- [ ] 下載個人 CSV，以 Excel 開啟中文正常顯示
- [ ] 下載個人 Excel，有「詳細清單」和「統計摘要」兩個 Sheet
- [ ] Excel 有弱點列有對應顏色標示
- [ ] leader1 嘗試下載 grp-rd2 的報表，被拒絕

---

## 三、部署說明

### 3.1 Vercel 部署步驟

```bash
# 1. 在 Vercel Dashboard 建立新專案，匯入 GitHub 儲存庫

# 2. 在 Vercel 整合中加入 Neon（Vercel Marketplace）
#    → 自動注入 DATABASE_URL, POSTGRES_URL 等環境變數

# 3. 在 Vercel Dashboard 手動設定以下環境變數：
#    AUTH_SECRET=<至少 32 字元的隨機字串>
#    AUTH_URL=https://<your-domain>.vercel.app
#    NVD_API_KEY=<NVD API 金鑰>
#    NVD_API_URL=https://services.nvd.nist.gov/rest/json/cves/2.0
#    VULN_CACHE_TTL_HOURS=24

# 4. 推送程式碼，Vercel 自動部署

# 5. 部署後初始化資料庫（使用 Neon 連線字串）
DATABASE_URL=<neon-url> pnpm db:push
DATABASE_URL=<neon-url> pnpm db:seed
```

### 3.2 本地開發環境設定

建立 `.env.local`（參考 `.env.local.example`）：
```env
AUTH_SECRET=local-dev-secret-key-at-least-32-chars
AUTH_URL=http://localhost:3000

# 從 Vercel Dashboard → Storage → 選擇 Neon DB → Connection Details 複製
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?channel_binding=require&sslmode=require

NVD_API_KEY=（可選）
NVD_API_URL=https://services.nvd.nist.gov/rest/json/cves/2.0
VULN_CACHE_TTL_HOURS=24
```

> 本地開發直接連接 Neon 雲端資料庫，無需在本機安裝 PostgreSQL。
> 建議在 Neon Dashboard 建立獨立的 `dev` Branch，避免測試資料污染正式環境。

啟動開發：
```bash
pnpm install
pnpm db:push    # 建立資料表（推送 Schema 至 Neon）
pnpm db:seed    # 插入測試資料
pnpm dev        # 啟動開發伺服器
```

### 3.3 AUTH_SECRET 產生方式

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 或使用 openssl
openssl rand -hex 32
```

### 3.4 NVD API 金鑰取得

前往 `https://nvd.nist.gov/developers/request-an-api-key` 申請免費 API 金鑰。
無金鑰時每筆查詢間隔 6 秒（速率限制），有金鑰時間隔 700ms。
