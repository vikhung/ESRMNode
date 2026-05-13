import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import bcrypt from 'bcryptjs'
import * as schema from './schema'

// tsx 直接執行時不會讀取 .env.local，需手動載入
config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

async function main() {
  console.log('開始清除既有資料...')

  // 依外鍵順序清除
  await db.delete(schema.cveEntries)
  await db.delete(schema.vulnCache)
  await db.delete(schema.scanProgress)
  await db.delete(schema.softwareEntries)
  await db.delete(schema.softwareInfo)
  await db.delete(schema.users)
  await db.delete(schema.groups)
  await db.delete(schema.departments)

  console.log('插入部門資料...')

  await db.insert(schema.departments).values([
    {
      id: 'dept-rd',
      name: '研發部',
      directorUsername: 'director1',
      managerUsernames: ['manager1', 'manager2'],
    },
    {
      id: 'dept-sys',
      name: '系統部',
      directorUsername: 'director2',
      managerUsernames: ['manager3'],
    },
  ])

  console.log('插入組資料...')

  await db.insert(schema.groups).values([
    {
      id: 'grp-rd1',
      name: '研發一組',
      deptId: 'dept-rd',
      leaderUsername: 'leader1',
      managerUsername: 'manager1',
      memberUsernames: ['vik', 'bob', 'alice'],
    },
    {
      id: 'grp-rd2',
      name: '研發二組',
      deptId: 'dept-rd',
      leaderUsername: 'leader2',
      managerUsername: 'manager2',
      memberUsernames: ['david', 'eve'],
    },
    {
      id: 'grp-sys1',
      name: '系統一組',
      deptId: 'dept-sys',
      leaderUsername: 'leader3',
      managerUsername: 'manager3',
      memberUsernames: ['user1', 'user2'],
    },
  ])

  console.log('產生密碼雜湊並插入使用者資料...')

  const adminHash = await bcrypt.hash('Admin@123', 12)
  const memberHash = await bcrypt.hash('Test@123', 12)

  await db.insert(schema.users).values([
    {
      username: 'admin',
      displayName: '系統管理員',
      passwordHash: adminHash,
      role: 'ROLE_ADMIN',
      deptId: null,
      groupId: null,
    },
    {
      username: 'director1',
      displayName: '研發協理',
      passwordHash: memberHash,
      role: 'ROLE_DIRECTOR',
      deptId: 'dept-rd',
      groupId: null,
    },
    {
      username: 'director2',
      displayName: '系統協理',
      passwordHash: memberHash,
      role: 'ROLE_DIRECTOR',
      deptId: 'dept-sys',
      groupId: null,
    },
    {
      username: 'manager1',
      displayName: '研發經理一',
      passwordHash: memberHash,
      role: 'ROLE_MANAGER',
      deptId: 'dept-rd',
      groupId: null,
    },
    {
      username: 'manager2',
      displayName: '研發經理二',
      passwordHash: memberHash,
      role: 'ROLE_MANAGER',
      deptId: 'dept-rd',
      groupId: null,
    },
    {
      username: 'manager3',
      displayName: '系統經理',
      passwordHash: memberHash,
      role: 'ROLE_MANAGER',
      deptId: 'dept-sys',
      groupId: null,
    },
    {
      username: 'leader1',
      displayName: '研發一組組長',
      passwordHash: memberHash,
      role: 'ROLE_LEADER',
      deptId: 'dept-rd',
      groupId: 'grp-rd1',
    },
    {
      username: 'leader2',
      displayName: '研發二組組長',
      passwordHash: memberHash,
      role: 'ROLE_LEADER',
      deptId: 'dept-rd',
      groupId: 'grp-rd2',
    },
    {
      username: 'leader3',
      displayName: '系統一組組長',
      passwordHash: memberHash,
      role: 'ROLE_LEADER',
      deptId: 'dept-sys',
      groupId: 'grp-sys1',
    },
    {
      username: 'vik',
      displayName: 'Vik',
      passwordHash: memberHash,
      role: 'ROLE_MEMBER',
      deptId: 'dept-rd',
      groupId: 'grp-rd1',
    },
    {
      username: 'bob',
      displayName: 'Bob',
      passwordHash: memberHash,
      role: 'ROLE_MEMBER',
      deptId: 'dept-rd',
      groupId: 'grp-rd1',
    },
    {
      username: 'alice',
      displayName: 'Alice',
      passwordHash: memberHash,
      role: 'ROLE_MEMBER',
      deptId: 'dept-rd',
      groupId: 'grp-rd1',
    },
    {
      username: 'david',
      displayName: 'David',
      passwordHash: memberHash,
      role: 'ROLE_MEMBER',
      deptId: 'dept-rd',
      groupId: 'grp-rd2',
    },
    {
      username: 'eve',
      displayName: 'Eve',
      passwordHash: memberHash,
      role: 'ROLE_MEMBER',
      deptId: 'dept-rd',
      groupId: 'grp-rd2',
    },
    {
      username: 'user1',
      displayName: '系統成員一',
      passwordHash: memberHash,
      role: 'ROLE_MEMBER',
      deptId: 'dept-sys',
      groupId: 'grp-sys1',
    },
    {
      username: 'user2',
      displayName: '系統成員二',
      passwordHash: memberHash,
      role: 'ROLE_MEMBER',
      deptId: 'dept-sys',
      groupId: 'grp-sys1',
    },
  ])

  console.log('插入初始掃描進度記錄...')

  await db.insert(schema.scanProgress).values({
    id: 1,
    status: 'IDLE',
    total: 0,
    completed: 0,
    failed: 0,
  })

  console.log('✅ Seed 完成！共插入 2 個部門、3 個組、16 位使用者。')
}

main().catch((err) => {
  console.error('❌ Seed 失敗：', err)
  process.exit(1)
})
