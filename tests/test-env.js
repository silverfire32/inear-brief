// .env loader checks: parsing, root placement, and shell precedence.
import assert from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv, parseEnvText } from "../src/load-env.js";

assert.deepEqual(
  parseEnvText(
    [
      "# comment",
      "",
      "XAI_API_KEY=plain-value",
      'META_MODEL_API_KEY="quoted value"',
      "export EXTRA_KEY='single quoted'",
      "not a valid line",
      "EMPTY=",
    ].join("\n")
  ),
  {
    XAI_API_KEY: "plain-value",
    META_MODEL_API_KEY: "quoted value",
    EXTRA_KEY: "single quoted",
    EMPTY: "",
  }
);

const dir = await mkdtemp(join(tmpdir(), "inear-env-"));
const path = join(dir, ".env");
await writeFile(path, "INEAR_TEST_FROM_FILE=file-value\nINEAR_TEST_EXISTING=file-value\n");

delete process.env.INEAR_TEST_FROM_FILE;
process.env.INEAR_TEST_EXISTING = "shell-value";
try {
  loadEnv(path);
  assert.equal(process.env.INEAR_TEST_FROM_FILE, "file-value");
  assert.equal(process.env.INEAR_TEST_EXISTING, "shell-value", "shell environment must win over .env");
} finally {
  delete process.env.INEAR_TEST_FROM_FILE;
  delete process.env.INEAR_TEST_EXISTING;
}

assert.deepEqual(loadEnv(join(dir, "does-not-exist.env")), {}, "missing .env is a no-op");

console.log("test-env: OK — parsing, precedence, missing-file no-op");
