// Minimal .env loader for local development.
//
// Looks for a .env file in the project root (the folder containing
// package.json), whether or not the command was run from that folder.
// Real environment variables already set in the shell take precedence;
// values from .env never override them. A missing .env is fine — the
// providers simply report their key as not set, as before.
//
// Supported lines: KEY=value, KEY="value", KEY='value', export KEY=value,
// blank lines, and # comments. Values are never printed or logged.
// The .env file itself is gitignored; commit .env.example instead.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function loadEnv(path = DEFAULT_ENV_PATH) {
  if (!existsSync(path)) return {};
  const values = parseEnvText(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return values;
}
