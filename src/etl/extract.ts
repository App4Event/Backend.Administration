import limit from 'p-limit'
import { EtlEvents } from './events'

export type ExtractedEntity = {
  id: string
  label: string
  data: any
}

export type Extract = () => Promise<ExtractedEntity[]>

const MAX_CONCURRENCY = 10

export interface Extraction {
  maxConcurrency: number
  numberOfEntities: number
  extractionsTotal: number
  extractionsCompleted: number
  storage: { [label: string]: { [id: string]: any } }
}

const extractSources = async (
  extractions: Extract[],
  options?: { events?: EtlEvents }
) => {
  const state: Extraction = {
    maxConcurrency: MAX_CONCURRENCY,
    numberOfEntities: 0,
    extractionsTotal: extractions.length,
    extractionsCompleted: 0,
    storage: {},
  }
  options?.events?.onExtractStarted?.(state)
  const limited = limit(state.maxConcurrency)
  await Promise.all(
    extractions.map((x) =>
      limited(async () => {
        const result = await x()
        state.numberOfEntities += result.length
        result.forEach((entity) => {
          if (!state.storage[entity.label]) {
            state.storage[entity.label] = {}
          }
          state.storage[entity.label][entity.id] = entity.data
        })
        state.extractionsCompleted++
        options?.events?.onExtractProgress?.(state)
      })
    )
  )
  options?.events?.onExtractComplete?.(state)
  return state
}

export { extractSources }
