import { describe, test } from 'node:test';
import { Stage, trackProgress } from './progress';
import { Extraction } from './extract';
import { deepEqual } from 'assert';

describe('etl/progress', () => {
  test('created event listener emits total progress', () => {
    const events: string[] = []
    const listener = trackProgress(
      (progress) => events.push(`progress ${progress.stage} ${progress.progress}`),
    )
    listener.onExtractStarted({} as Extraction)
    listener.onExtractProgress({} as Extraction)
    listener.onExtractComplete({} as Extraction)
    deepEqual(events, [
      `progress ${Stage.StartingExtraction} 0`,
      `progress ${Stage.Extracting} 0.14`,
      `progress ${Stage.StartingLoad} 0.29`,
    ])
  })
})
