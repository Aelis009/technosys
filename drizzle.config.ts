import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { serverEnvSchema } from './src/lib/env.ts'

config({ path: ['.env.local', '.env'] })

const { DATABASE_URL } = serverEnvSchema.parse(process.env)

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
})
