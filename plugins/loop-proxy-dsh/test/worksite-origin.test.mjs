import assert from "node:assert/strict"
import test from "node:test"

import {worksiteOrigin} from "../worksite-origin.mjs"

test("worksite origins are stable, opaque, and installation-isolated", () => {
  assert.equal(
    worksiteOrigin("installation-worksite", "work.localhost:6450", "http").href,
    "http://3915a45e5db4118191b38c318c73a9a3.work.localhost:6450/",
  )
  assert.notEqual(
    worksiteOrigin("installation-a", "work.localhost:6450", "http").host,
    worksiteOrigin("installation-b", "work.localhost:6450", "http").host,
  )
  assert.equal(
    worksiteOrigin("installation-worksite", "work.example", "https").href,
    "https://3915a45e5db4118191b38c318c73a9a3.work.example/",
  )
})

test("worksite origin configuration rejects wildcard, IP, and path authorities", () => {
  for (const parent of ["localhost", "127.0.0.1", "*.work.example", "work.example/path"]) {
    assert.throws(() => worksiteOrigin("installation", parent, "https"))
  }
  assert.throws(() => worksiteOrigin("", "work.example", "https"))
  assert.throws(() => worksiteOrigin("installation", "work.example", "ftp"))
})
