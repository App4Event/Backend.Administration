import { extractSources } from './extract'
import { loadToAbstractFirestore, loadToFirestore } from './load'
import { trackProgress } from './progress'
import { transform } from './transform'
export type { EtlEvents } from './events'
export type { AbstractFirestore } from './load'

export const etl = {
  extractSources,
  loadToFirestore,
  loadToAbstractFirestore,
  transform,
  trackProgress,
}
