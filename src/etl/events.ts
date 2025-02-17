import { Extraction } from './extract'

export interface EtlEvents {
  /** Called when the extraction starts */
  onExtractStarted: (extractor: Extraction) => void
  /** Called on any extractionprogress update */
  onExtractProgress: (extractor: Extraction) => void
  /** Called when the extraction completes */
  onExtractComplete: (extractor: Extraction) => void
  onTransformStarted: () => void
  onTransformComplete: () => void
  onLoadStarted: () => void
  onLoadProgress: (displayName: string) => void
  onLoadComplete: () => void
}
