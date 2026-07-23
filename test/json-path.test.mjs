import test from 'node:test'
import assert from 'node:assert/strict'
import { findJsonPathAtOffset } from '../src/utils/json-path.ts'

test('根据光标位置区分不同分支下的同名 token', () => {
  const json = `{
  "data": {
    "token": "first"
  },
  "meta": {
    "token": "second"
  }
}`

  assert.equal(
    findJsonPathAtOffset(json, json.indexOf('"first"') + 1),
    '$.data.token',
  )
  assert.equal(
    findJsonPathAtOffset(json, json.indexOf('"second"') + 1),
    '$.meta.token',
  )
})

test('光标落在键名上时也能返回完整路径', () => {
  const json = `{
  "meta": {
    "token": "second"
  }
}`

  assert.equal(
    findJsonPathAtOffset(json, json.indexOf('"token"') + 2),
    '$.meta.token',
  )
})
