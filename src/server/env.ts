import { createServerOnlyFn } from "@tanstack/react-start";
import { config } from "dotenv";
import { serverEnvSchema } from "../lib/env.ts";

config({ path: [".env.local", ".env"] });

export const getServerEnv = createServerOnlyFn(() =>
	serverEnvSchema.parse(process.env),
);
