import test from "node:test";
import assert from "node:assert/strict";

import {
  WORLD_VIEWS,
  normalizeWorldView,
  worldViewForHash,
  worldViewHref,
  worldViewLabel,
} from "../playtest/world-workspace-model.js";

test("F1 World exposes six player-facing workspace views", () => {
  assert.deepEqual(WORLD_VIEWS.map((row) => row.id), [
    "overview",
    "news",
    "drivers",
    "teams",
    "history",
    "records",
  ]);
  assert.equal(new Set(WORLD_VIEWS.map((row) => row.id)).size, 6);
});

test("F1 World workspace resolves stable hashes and safe fallback", () => {
  assert.equal(worldViewForHash(""), "overview");
  assert.equal(worldViewForHash("#news"), "news");
  assert.equal(worldViewForHash("#drivers"), "drivers");
  assert.equal(worldViewForHash("#not-a-view"), null);
  assert.equal(normalizeWorldView("#not-a-view"), "overview");
});

test("F1 World workspace provides stable labels and deep links", () => {
  assert.equal(worldViewLabel("#records"), "Records");
  assert.equal(worldViewLabel("#history"), "History");
  assert.equal(worldViewHref("teams"), "/world.html#teams");
  assert.equal(worldViewHref("news"), "/world.html#news");
});
