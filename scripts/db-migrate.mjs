/**
 * Runs .sql files against the linked Supabase project.
 *
 *   node scripts/db-migrate.mjs supabase/attendance.sql [...more.sql]
 *
 * PostgREST cannot execute DDL and the project's secret key is not a Postgres
 * credential, so this goes through the Management API instead. That needs a
 * personal access token, which is a *different* secret from anything in
 * .env.local:
 *
 *   https://supabase.com/dashboard/account/tokens  ->  "Generate new token"
 *
 * Pass it as SUPABASE_ACCESS_TOKEN, either in the environment or in .env.local.
 * It is account-wide and grants far more than the app's keys do, so prefer
 * exporting it for one command over leaving it on disk:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-migrate.mjs supabase/attendance.sql
 *
 * Each file is sent as a single statement batch, so a file that fails part way
 * leaves the earlier statements applied. Every migration here is written to be
 * idempotent, so the fix is to correct the file and run it again.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ENDPOINT = "https://api.supabase.com/v1/projects";

/** Minimal .env parser: KEY=value, ignoring comments, blanks and quotes. */
async function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = await readFile(path, "utf8");
  const out = {};

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  fail("Usage: node scripts/db-migrate.mjs <file.sql> [...]");
}

const fileEnv = await loadEnvFile(".env.local");
const token = process.env.SUPABASE_ACCESS_TOKEN ?? fileEnv.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;

if (!token) {
  fail(
    "Missing SUPABASE_ACCESS_TOKEN.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens and pass it as\n" +
      "an environment variable. This is not the same as SUPABASE_SECRET_KEY.",
  );
}
if (!url) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL — cannot tell which project to migrate.");
}

// https://<ref>.supabase.co  ->  <ref>
const ref = new URL(url).hostname.split(".")[0];
console.log(`Project ${ref}\n`);

for (const file of files) {
  const query = await readFile(file, "utf8");
  process.stdout.write(`  ${file} … `);

  const response = await fetch(`${ENDPOINT}/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const body = await response.text();
  if (!response.ok) {
    console.log("failed");
    fail(`${file} (HTTP ${response.status})\n${body}`);
  }
  console.log("ok");
}

console.log("\nDone.");
