import test, { describe } from 'node:test'
import { etl } from '.'

describe('etl', () => {
  test('x', async (t) => {
    const extract = await etl.extractSources([
      async () => {
        return [
          {
            label: 'test',
            id: '1',
            data: {
              name: 'John Doe',
            },
          },
        ]
      },
    ])
    const transformed = await etl.transform(async (t) => {
      const x = extract.storage['test'][1]
      await t.addPerformer({
        id: '1',
        language: 'en',
        data: {
          name: x.name,
        },
      })
    })
    const saveMany = t.mock.fn(async () => {})
    await etl.loadToAbstractFirestore({
      saveMany,
    }, transformed)
    console.log(saveMany.mock.calls)
  })
})
