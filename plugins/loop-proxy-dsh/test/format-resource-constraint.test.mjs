import test from 'node:test'
import assert from 'node:assert/strict'
import {formatResourceConstraint} from '../client/ui/format-resource-constraint.ts'

test("directory consent displays the literal search without changing the grant", () => {
  const value = "resource-lookup:kb/%E6%98%A5+%2B%2F%25"
  assert.equal(formatResourceConstraint(value), 'resource-lookup:kb/"春 +/%"')
  for (const raw of ["channel:abc", "resource-lookup:all/", "resource-lookup:kb/%ZZ", "resource-lookup:kb/%0A", "resource-lookup:kb/%E2%80%AE"]) {
    assert.equal(formatResourceConstraint(raw), raw)
  }
})
