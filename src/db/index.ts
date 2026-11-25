import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnv } from "../server/env.ts";
import * as relations from "./relations.ts";
import * as schema from "./schema.ts";

const pool = new Pool({
	connectionString: getServerEnv().DATABASE_URL,
});

export const db = drizzle(pool, {
	schema: {
		...schema,
		...relations,
	},
});

export async function closeDb(): Promise<void> {
	await pool.end();
}
