import test, { describe } from 'node:test'
import { ExtractedEntity, extractSources } from './extract'
import { deepEqual, equal } from 'assert'
import { EtlEvents } from './events'

describe('etl/extract', () => {
  test('extractSources accumulates entites in storage', async () => {
    const result = await extractSources([
      () => Promise.resolve([{ id: '1', label: 'test', data: 'test' }]),
      () => Promise.resolve([{ id: '2', label: 'test', data: 'test' }]),
    ])
    equal(result.extractionsCompleted, 2)
    deepEqual(result.storage, {
      test: {
        '1': 'test',
        '2': 'test',
      },
    })
  })
  test('extractSources limits concurrency to max 10 tasks at a time', async () => {
    const resolves: Array<() => void> = []
    const starts: boolean[] = []
    const result = extractSources(
      Array.from({ length: 20 }, (_, i) => {
        const promise = new Promise<ExtractedEntity[]>((resolve) => {
          resolves.push(() => resolve([]))
        })
        const task = () => {
          starts[i] = true
          return promise
        }
        return task
      })
    )
    await new Promise((resolve) => setImmediate(resolve))
    equal(starts.filter((x) => x).length, 10)
    resolves[0]()
    await new Promise((resolve) => setImmediate(resolve))
    equal(starts.filter((x) => x).length, 11)
    resolves.forEach((resolve) => resolve())
    await result
  })
  test('extractSources emits events', async () => {
    const events: string[] = []
    await extractSources(
      [
        () => Promise.resolve([{ id: '1', label: 'test', data: 'test' }]),
        () => Promise.resolve([{ id: '2', label: 'test', data: 'test' }]),
      ],
      {
        events: {
          ...({} as EtlEvents),
          onExtractComplete: (state) =>
            events.push(
              `complete ${state.extractionsCompleted} ${state.extractionsTotal}`
            ),
          onExtractProgress: (state) =>
            events.push(
              `progress ${state.extractionsCompleted} ${state.extractionsTotal}`
            ),
          onExtractStarted: (state) =>
            events.push(
              `started ${state.extractionsCompleted} ${state.extractionsTotal}`
            ),
        },
      }
    )
    equal(events[0], 'started 0 2')
    equal(events[1], 'progress 1 2')
    equal(events[2], 'progress 2 2')
    equal(events[3], 'complete 2 2')
  })
})
