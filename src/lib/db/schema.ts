import {
  pgTable,
  pgEnum,
  varchar,
  text,
  timestamp,
  serial,
  integer,
  numeric,
} from 'drizzle-orm/pg-core'

// --- Enums ---

export const roleEnum = pgEnum('role', [
  'ROLE_ADMIN',
  'ROLE_DIRECTOR',
  'ROLE_MANAGER',
  'ROLE_LEADER',
  'ROLE_MEMBER',
])

export const severityEnum = pgEnum('severity', [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'NONE',
])

export const scanStatusEnum = pgEnum('scan_status', [
  'IDLE',
  'RUNNING',
  'COMPLETED',
  'CANCELLED',
])

// --- 部門 ---

export const departments = pgTable('departments', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  directorUsername: varchar('director_username', { length: 50 }),
  managerUsernames: text('manager_usernames').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- 組 ---

export const groups = pgTable('groups', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  deptId: varchar('dept_id', { length: 50 }).notNull(),
  leaderUsername: varchar('leader_username', { length: 50 }),
  managerUsername: varchar('manager_username', { length: 50 }),
  memberUsernames: text('member_usernames').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- 使用者 ---

export const users = pgTable('users', {
  username: varchar('username', { length: 50 }).primaryKey(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('ROLE_MEMBER'),
  deptId: varchar('dept_id', { length: 50 }),
  groupId: varchar('group_id', { length: 50 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- 軟體上傳資訊（每人一筆） ---

export const softwareInfo = pgTable('software_info', {
  username: varchar('username', { length: 50 }).primaryKey(),
  hostname: varchar('hostname', { length: 200 }).notNull(),
  uploadedAt: timestamp('uploaded_at').notNull(),
})

// --- 軟體安裝項目（每人多筆） ---

export const softwareEntries = pgTable('software_entries', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  publisher: text('publisher'),
  installDate: text('install_date'),
  installPath: text('install_path'),
})

// --- 弱點快取（以 softwareKey 為 PK，全公司共用） ---

export const vulnCache = pgTable('vuln_cache', {
  softwareKey: text('software_key').primaryKey(),
  severity: severityEnum('severity'),
  cveIds: text('cve_ids').array().notNull().default([]),
  checkedAt: timestamp('checked_at').notNull(),
})

// --- CVE 詳細資訊 ---

export const cveEntries = pgTable('cve_entries', {
  id: serial('id').primaryKey(),
  softwareKey: text('software_key').notNull(),
  cveId: varchar('cve_id', { length: 30 }).notNull(),
  cvss: numeric('cvss', { precision: 4, scale: 1 }),
  description: text('description'),
  publishedAt: timestamp('published_at'),
})

// --- 掃描進度（固定單筆，id = 1） ---

export const scanProgress = pgTable('scan_progress', {
  id: integer('id').primaryKey().default(1),
  status: scanStatusEnum('status').notNull().default('IDLE'),
  total: integer('total').notNull().default(0),
  completed: integer('completed').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  currentSoftware: text('current_software'),
  startedAt: timestamp('started_at'),
})
