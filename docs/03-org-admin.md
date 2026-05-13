# ESRM 組織管理與使用者管理設計文件
# 03 — 組織 CRUD、使用者管理、Admin 頁面

**對應步驟**：步驟五、步驟六  
**前置文件**：`01-data-model.md`、`02-security-auth.md`

---

## 一、組織管理 Server Actions（`src/lib/actions/org.ts`）

所有函式頂部必須：
```typescript
'use server'
const session = await auth()
if (session?.user?.role !== 'ROLE_ADMIN') throw new Error('權限不足')
```

### 1.1 部門操作

#### getDepartments()
- 查詢所有 `departments`，依 `name` 排序
- 回傳：`Department[]`

#### createDepartment(data: { id: string; name: string; directorUsername?: string })
- 驗證 id 不重複
- 插入 `departments`
- 若指定 directorUsername，驗證使用者存在

#### updateDepartment(id: string, data: { name?: string; directorUsername?: string; managerUsernames?: string[] })
- 更新 `departments` 指定欄位

#### deleteDepartment(id: string)
- **前置檢查**：查詢 `groups WHERE deptId = id`，若有組則拋出錯誤「請先刪除部門下的所有組」
- 刪除 `departments WHERE id = id`

### 1.2 組操作

#### getGroups(deptId: string)
- 查詢 `groups WHERE deptId = deptId`，依 `name` 排序
- 回傳：`Group[]`

#### createGroup(data: { id: string; name: string; deptId: string; leaderUsername?: string; managerUsername?: string })
- 驗證 id 不重複
- 驗證 deptId 存在
- 插入 `groups`

#### updateGroup(id: string, data: { name?: string; leaderUsername?: string; managerUsername?: string })
- 更新 `groups` 指定欄位

#### deleteGroup(id: string)
- **前置檢查**：查詢 `groups WHERE id = id` 取得 `memberUsernames`，若非空陣列則拋出錯誤「請先移除組內所有成員」
- 刪除 `groups WHERE id = id`

### 1.3 成員操作

#### addMember(groupId: string, username: string)
- 驗證使用者存在
- **前置檢查**：查詢所有 `groups` 的 `memberUsernames`，若 username 已在任何一個組 → 拋出錯誤「此帳號已屬於其他組」
- 將 username append 到 `groups.memberUsernames` 陣列
- 更新 `users.groupId = groupId` where `username`

#### removeMember(groupId: string, username: string)
- 從 `groups.memberUsernames` 陣列移除 username
- 將 `users.groupId = null` where `username`

---

## 二、組織管理頁面（`src/app/admin/org/page.tsx`）

### 2.1 頁面佈局

```
┌─────────────────────────────────────────────────────┐
│ 頁面標題：組織管理           [+ 新增部門]              │
├──────────────────┬──────────────────────────────────┤
│ 部門清單（左欄）   │ 組與成員詳情（右欄）               │
│                  │                                  │
│ [dept-rd]        │ 部門：研發部                       │
│ > 研發部 ✏️ 🗑️   │ 協理：director1                    │
│                  │ 經理：manager1, manager2           │
│ [dept-sys]       │                                  │
│   系統部 ✏️ 🗑️   │ ┌─────────────────────────────┐  │
│                  │ │ 組：研發一組 ✏️ 🗑️ [+ 加成員] │  │
│                  │ │ 組長：leader1               │  │
│                  │ │ 組員：vik, bob, alice [✕]    │  │
│                  │ └─────────────────────────────┘  │
│                  │                                  │
│                  │ [+ 新增組]                        │
└──────────────────┴──────────────────────────────────┘
```

### 2.2 互動細節

**新增/編輯部門（Dialog）**
- 欄位：部門代碼（id，新增時填入）、部門名稱、協理帳號（可空）
- 確認後呼叫 `createDepartment` / `updateDepartment`
- 成功後 `toast.success('部門已儲存')` + 重新整理列表

**刪除部門（AlertDialog）**
- 警告文字：「確認刪除「{部門名稱}」？此操作不可復原。」
- 確認後呼叫 `deleteDepartment`
- 若有錯誤（有子組）顯示 `toast.error(錯誤訊息)`

**新增/編輯組（Dialog）**
- 欄位：組代碼（id，新增時填入）、組名稱、負責經理帳號、組長帳號

**加入成員（Dialog）**
- 輸入要加入的帳號
- 呼叫 `addMember`

**移除成員（AlertDialog）**
- 警告：「確認從此組移除 {username}？」

---

## 三、使用者管理 Server Actions（`src/lib/actions/users.ts`）

所有函式頂部驗證 ROLE_ADMIN（同組織管理）。

### 3.1 函式清單

#### getUsers()
- 查詢所有 `users`，依 `username` 排序
- **不回傳 passwordHash**
- 回傳：`Omit<User, 'passwordHash'>[]`

#### createUser(data: { username: string; displayName: string; password: string; role: EsrmRole; deptId?: string; groupId?: string })
- 驗證 username 不重複
- `bcrypt.hash(password, 12)` 產生 passwordHash
- 插入 `users`
- 若指定 groupId，將 username 加入 `groups.memberUsernames`

#### updateUser(username: string, data: { displayName?: string; role?: EsrmRole; deptId?: string; groupId?: string })
- 更新 `users` 指定欄位
- 若 groupId 變更：
  - 從舊 group 的 memberUsernames 移除
  - 加入新 group 的 memberUsernames

#### resetPassword(username: string, newPassword: string)
- `bcrypt.hash(newPassword, 12)`
- 更新 `users.passwordHash`

#### deleteUser(username: string)
- 刪除 `software_entries WHERE username`
- 刪除 `software_info WHERE username`
- 從其所在 `groups.memberUsernames` 移除
- 刪除 `users WHERE username`

---

## 四、使用者管理頁面（`src/app/admin/users/page.tsx`）

### 4.1 頁面佈局

```
┌─────────────────────────────────────────────────────┐
│ 頁面標題：使用者管理        [搜尋欄]    [+ 新增使用者] │
├─────────┬──────────┬──────────┬─────────┬──────────┤
│ 帳號     │ 顯示名稱  │ 角色     │ 部門/組  │ 操作     │
├─────────┼──────────┼──────────┼─────────┼──────────┤
│ admin   │ 管理員    │ ADMIN    │ -       │ ✏️ 🔑 🗑️ │
│ vik     │ Vik      │ MEMBER   │ 研發部/  │ ✏️ 🔑 🗑️ │
│         │          │          │ 研發一組  │          │
└─────────┴──────────┴──────────┴─────────┴──────────┘
```

### 4.2 新增/編輯使用者（Dialog）

欄位：
| 欄位 | 說明 | 驗證 |
|------|------|------|
| 帳號 | 僅新增時顯示 | 必填，僅英數字與底線 |
| 顯示名稱 | | 必填 |
| 密碼 | 僅新增時必填 | 新增必填，編輯時可空 |
| 角色 | 下拉選單 | 必填 |
| 部門 | 下拉（查現有部門） | 可空 |
| 組 | 下拉（依部門篩選） | 可空 |

### 4.3 重設密碼（Dialog）

- 輸入新密碼（一次即可，無需確認輸入）
- 確認後呼叫 `resetPassword`
- 成功後 `toast.success('密碼已重設')`

### 4.4 刪除使用者（AlertDialog）

- 警告：「確認刪除使用者「{username}」？其所有軟體資料也會一併刪除。」
