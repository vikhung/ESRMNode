import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

// drizzle-kit 不自動讀取 .env.local，需手動載入
config({ path: '.env.local' })

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
