import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  builtinMediaFallbackSvg,
  loadMediaPack,
  mediaPackSummary,
  resolveMediaAsset,
  resolveServedMediaPath,
} from "../src/media/mediaPack.js";

function withPack(manifest, files, run) {
  const root = mkdtempSync(join(tmpdir(), "f1-media-pack-"));
  try {
    writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
    for (const [relativePath, content] of Object.entries(files ?? {})) {
      const path = join(root, ...relativePath.split("/"));
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function manifest(overrides = {}) {
  return {
    format: "f1-manager-sim-media-pack",
    schemaVersion: 1,
    id: "test-pack",
    name: "Test Pack",
    version: "1.0.0",
    assetRoot: ".",
    supportedExtensions: ["webp", "png", "jpg", "jpeg"],
    defaults: { driver: "defaults/driver.png", teamLogo: "defaults/team.png" },
    overrides: {},
    ...overrides,
  };
}

test("media resolver falls back to the built-in application asset when no pack is selected", () => {
  const pack = loadMediaPack(null);
  const resolved = resolveMediaAsset(pack, "driver", "d_0001");
  assert.equal(pack.available, false);
  assert.equal(resolved.source, "builtin");
  assert.equal(resolved.relativePath, null);
  assert.equal(resolved.url, "/media/fallback/driver.svg");
  assert.match(builtinMediaFallbackSvg("driver"), /<svg/);
});

test("media resolver prefers canonical stable-id files using manifest extension order", () => {
  withPack(manifest(), {
    "people/drivers/d_0001.png": "png",
    "people/drivers/d_0001.jpg": "jpg",
    "defaults/driver.png": "default",
  }, (root) => {
    const pack = loadMediaPack(root, { required: true });
    const resolved = resolveMediaAsset(pack, "driver", "d_0001");
    assert.equal(resolved.source, "canonical");
    assert.equal(resolved.relativePath, "people/drivers/d_0001.png");
    assert.equal(resolved.url, "/media/assets/people/drivers/d_0001.png");
    assert.deepEqual(mediaPackSummary(pack), {
      available: true,
      id: "test-pack",
      name: "Test Pack",
      version: "1.0.0",
      schemaVersion: 1,
      supportedExtensions: ["webp", "png", "jpg", "jpeg"],
    });
  });
});

test("manifest override wins and missing entity assets use an existing pack default", () => {
  withPack(manifest({ overrides: { driver: { d_0001: "custom/hero.jpg" } } }), {
    "custom/hero.jpg": "hero",
    "people/drivers/d_0001.png": "canonical",
    "defaults/driver.png": "default",
  }, (root) => {
    const pack = loadMediaPack(root, { required: true });
    const overridden = resolveMediaAsset(pack, "driver", "d_0001");
    const missing = resolveMediaAsset(pack, "driver", "d_9999");
    assert.equal(overridden.source, "override");
    assert.equal(overridden.relativePath, "custom/hero.jpg");
    assert.equal(missing.source, "pack_default");
    assert.equal(missing.relativePath, "defaults/driver.png");
  });
});

test("media manifests reject absolute or traversal asset paths", () => {
  withPack(manifest({ overrides: { "driver:d_0001": "../secret.png" } }), {}, (root) => {
    assert.throws(() => loadMediaPack(root, { required: true }), /escapes the media pack/);
  });
  withPack(manifest({ defaults: { driver: "/tmp/secret.png" } }), {}, (root) => {
    assert.throws(() => loadMediaPack(root, { required: true }), /relative to the media pack/);
  });
});

test("served media paths stay contained and only expose supported media files", () => {
  withPack(manifest(), {
    "people/drivers/d_0001.png": "png",
    "notes.txt": "not media",
  }, (root) => {
    const pack = loadMediaPack(root, { required: true });
    assert.equal(resolveServedMediaPath(pack, "../manifest.json"), null);
    assert.equal(resolveServedMediaPath(pack, "notes.txt"), null);
    assert.equal(resolveServedMediaPath(pack, "people/drivers/d_0001.png")?.relativePath, "people/drivers/d_0001.png");
  });
});

test("malformed or unsupported manifests fail fast", () => {
  withPack(manifest({ schemaVersion: 99 }), {}, (root) => {
    assert.throws(() => loadMediaPack(root, { required: true }), /schemaVersion/);
  });
  withPack(manifest({ supportedExtensions: ["exe"] }), {}, (root) => {
    assert.throws(() => loadMediaPack(root, { required: true }), /Unsupported media extension/);
  });
});
