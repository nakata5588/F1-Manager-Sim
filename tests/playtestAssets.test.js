import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

for (const path of ["scripts/playtest-server.js", "playtest/app.js", "playtest/index.html", "playtest/styles.css"]) {
  test(`developer playtest asset exists: ${path}`, () => {
    assert.equal(existsSync(path), true);
  });
}

for (const path of ["scripts/playtest-server.js", "playtest/app.js"]) {
  test(`developer playtest JavaScript parses: ${path}`, () => {
    const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
