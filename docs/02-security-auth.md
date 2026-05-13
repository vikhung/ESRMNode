# ESRM 認證與共用版面設計文件
# 02 — NextAuth.js、登入頁、Navbar、Sidebar

**對應步驟**：步驟三  
**前置文件**：`00.SD-design.md` 第六節、`01-data-model.md`

---

## 一、NextAuth.js v5 設定（`src/lib/auth.ts`）

### 1.1 型別定義

```typescript
export type EsrmRole =
  | 'ROLE_ADMIN'
  | 'ROLE_DIRECTOR'
  | 'ROLE_MANAGER'
  | 'ROLE_LEADER'
  | 'ROLE_MEMBER'

export interface EsrmUser {
  username: string
  displayName: string
  role: EsrmRole
  deptId?: string
  groupId?: string
}
```

Session 型別擴充（NextAuth module augmentation）：
```typescript
declare module 'next-auth' {
  interface Session {
    user: EsrmUser
  }
  interface User extends EsrmUser {}
}
declare module 'next-auth/jwt' {
  interface JWT extends EsrmUser {}
}
```

### 1.2 Credentials Provider

```
authorize(credentials):
  1. 從 DB 查詢 users WHERE username = credentials.username
  2. 若找不到帳號 → 回傳 null（不透露是帳號或密碼錯誤）
  3. bcrypt.compare(credentials.password, user.passwordHash)
  4. 比對失敗 → 回傳 null
  5. 比對成功 → 回傳 { id: username, username, displayName, role, deptId, groupId }
```

### 1.3 Callbacks

```
jwt callback:
  - 首次登入（trigger === 'signIn'）：將 user 物件屬性存入 token
  - 後續：從 token 還原

session callback:
  - 將 token 中的 username/displayName/role/deptId/groupId 掛到 session.user
```

### 1.4 設定選項

```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [CredentialsProvider(...)],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: { jwt, session },
})
```

### 1.5 hasRole 輔助函式

角色階層順序（數值越大代表越高權限）：

```typescript
const ROLE_ORDER: Record<EsrmRole, number> = {
  ROLE_MEMBER: 1,
  ROLE_LEADER: 2,
  ROLE_MANAGER: 3,
  ROLE_DIRECTOR: 4,
  ROLE_ADMIN: 5,
}

export function hasRole(session: Session | null, minRole: EsrmRole): boolean {
  if (!session?.user?.role) return false
  return ROLE_ORDER[session.user.role] >= ROLE_ORDER[minRole]
}
```

---

## 二、路由保護（`middleware.ts`）

### 2.1 保護規則

| 路徑 | 最低角色要求 | 未符合時 |
|------|------------|---------|
| `/login` | 無（公開） | 已登入則導向 `/dashboard` |
| `/dashboard`, `/software/*`, `/report` | 已登入（任何角色） | 導向 `/login` |
| `/admin/*` | ROLE_ADMIN | 呼叫 `forbidden()` |
| `/vuln/*` | ROLE_ADMIN | 呼叫 `forbidden()` |

### 2.2 Middleware 實作

```typescript
export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // 已登入訪問 /login → 導向 dashboard
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // 未登入訪問受保護頁面 → 導向 /login
  if (pathname !== '/login' && !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // admin/vuln 路徑需要 ROLE_ADMIN
  if ((pathname.startsWith('/admin') || pathname.startsWith('/vuln')) &&
      session?.user?.role !== 'ROLE_ADMIN') {
    return forbidden()
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|public).*)'],
}
```

---

## 三、Auth Route Handler（`src/app/api/auth/[...nextauth]/route.ts`）

```typescript
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```

---

## 四、登入頁（`src/app/login/page.tsx`）

### 4.1 UI 規格

- 頁面置中，使用 shadcn/ui `Card`（寬度 `max-w-sm w-full`）
- 卡片內容：
  - 標題：「ESRM 企業軟體風險監控系統」
  - 副標題：「請登入以繼續」
  - 表單欄位：帳號（Input）、密碼（Input type="password"）
  - 登入按鈕（Button，全寬）
  - 錯誤訊息區（紅色文字，帳號或密碼錯誤時顯示）
- 背景：`bg-gray-50 min-h-screen`

### 4.2 表單行為

- 使用 Next.js Server Action 處理登入
- 呼叫 `signIn('credentials', { username, password, redirect: false })`
- 登入成功 → `redirect('/dashboard')`
- 登入失敗 → 顯示「帳號或密碼錯誤」（不區分是帳號還是密碼錯）
- 送出時按鈕顯示 Loading 狀態（`useFormStatus`）

### 4.3 登出

- Navbar 上有「登出」按鈕
- 呼叫 `signOut({ redirectTo: '/login' })`

---

## 五、共用版面 Layout

### 5.1 根 Layout（`src/app/layout.tsx`）

```typescript
// 套用全域字型與基本樣式
// 包含 <html lang="zh-TW">
// 包含 Toaster（Sonner）Provider
// 非登入頁面使用 <AppShell> 包裝（含 Navbar + Sidebar + 主內容區）
```

### 5.2 Navbar（`src/components/layout/navbar.tsx`）

| 區域 | 內容 |
|------|------|
| 左側 | 系統名稱「ESRM」（粗體） |
| 右側 | 顯示名稱 + 角色徽章 + 「登出」按鈕 |

- 固定在頁面頂部（`sticky top-0 z-50`）
- 背景：`bg-white border-b`
- 角色徽章顏色：
  - ROLE_ADMIN → `bg-red-100 text-red-800`
  - ROLE_DIRECTOR → `bg-purple-100 text-purple-800`
  - ROLE_MANAGER → `bg-blue-100 text-blue-800`
  - ROLE_LEADER → `bg-green-100 text-green-800`
  - ROLE_MEMBER → `bg-gray-100 text-gray-800`

### 5.3 Sidebar（`src/components/layout/sidebar.tsx`）

依角色顯示選單項目：

| 選單項目 | 路徑 | 最低角色 |
|---------|------|---------|
| 儀表板 | /dashboard | 所有人 |
| 我的軟體 | /software/my | 所有人 |
| 組軟體清單 | /software/group/[groupId] | ROLE_LEADER |
| 部門軟體清單 | /software/dept/[deptId] | ROLE_MANAGER |
| 全公司軟體清單 | /software/all | ROLE_ADMIN |
| 弱點掃描 | /vuln/scan | ROLE_ADMIN |
| 報表下載 | /report | 所有人 |
| 組織管理 | /admin/org | ROLE_ADMIN |
| 使用者管理 | /admin/users | ROLE_ADMIN |

- `lg` 以上：固定展開（`w-64`）
- `md` 以下：漢堡選單（點擊後滑入）
- 目前路徑的選單項目加上 `bg-blue-50 text-blue-700 font-medium` 樣式

---

## 六、錯誤頁面

### 6.1 `/forbidden`（403）

- 使用 Next.js 15 `forbidden.tsx` 慣例（`src/app/forbidden.tsx`）
- 顯示：「403 — 您沒有存取此頁面的權限」
- 提供「返回儀表板」連結

### 6.2 `not-found.tsx`（404）

- 顯示：「404 — 找不到此頁面」
- 提供「返回儀表板」連結

---

## 七、Toast 通知

- 使用 Sonner（`next/sonner` 或 `sonner` 套件）
- 成功訊息：`toast.success('...')`
- 錯誤訊息：`toast.error('...')`
- 在 `layout.tsx` 根層級加入 `<Toaster />`
