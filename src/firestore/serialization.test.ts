import test, { describe } from 'node:test'
import { firestore } from '.'
import { deepEqual, equal } from 'node:assert'
import { Timestamp } from 'firebase-admin/firestore'

describe('firestore/serialization', () => {
  test('empty object is serialized to empty object', () => {
    deepEqual(firestore.serialize({}), {})
  })
  test('undefined is serialized to undefined', () => {
    equal(firestore.serialize(undefined), undefined)
  })
  test('date is serialized to timestamp and vice versa', () => {
    const serialized = firestore.serialize({ date: new Date() })
    equal(serialized.date instanceof Timestamp, true)
    equal((firestore.deserialize(serialized) as any).date instanceof Date, true)
  })
  test('nested objects are serialized and deserialized', () => {
    const object = {
      l1: {
        l2: {
          l3: {
            var: 'value',
          },
        },
      },
    }
    deepEqual(firestore.deserialize(firestore.serialize(object)), object)
  })
})
