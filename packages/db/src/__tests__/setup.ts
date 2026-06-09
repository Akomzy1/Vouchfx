// Load the monorepo root .env before any test runs.
// Vitest doesn't crawl parent directories for .env by default.
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../../../.env") });
