import { logging } from '../logging'
import { EtlEvents } from './events'

const log = logging.createModuleLogger('etl')

export enum Stage {
  StartingExtraction,
  Extracting,
  StartingLoad,
  Loading,
  StartingCleanup,
  CleaningUp,
  Finished,
}

export interface Progress {
  stage: Stage
  progress: number
}

const stageProgress = (stage: Stage) => {
  return Number((stage / (Stage.Finished + 1)).toFixed(2))
}

const ignore = () => {}

export const trackProgress = (
  onProgress: (progress: Progress) => void,
  events?: Partial<EtlEvents>
) => {
  const listener: EtlEvents = {
    onExtractStarted: (extractor) => {
      onProgress({
        stage: Stage.StartingExtraction,
        progress: stageProgress(Stage.StartingExtraction),
      })
    },
    onExtractProgress: (extractor) => {
      onProgress({
        stage: Stage.Extracting,
        progress: stageProgress(Stage.Extracting),
      })
      events?.onExtractProgress?.(extractor)
    },
    onExtractComplete: (extractor) => {
      onProgress({
        stage: Stage.StartingLoad,
        progress: stageProgress(Stage.StartingLoad),
      })
      events?.onExtractComplete?.(extractor)
    },
    onLoadStarted: () => {
      onProgress({
        stage: Stage.StartingLoad,
        progress: stageProgress(Stage.StartingLoad),
      })
      events?.onLoadStarted?.()
    },
    onLoadProgress: (displayName) => {
      onProgress({
        stage: Stage.Loading,
        progress: stageProgress(Stage.Loading),
      })
      events?.onLoadProgress?.(displayName)
    },
    onLoadComplete: () => {
      onProgress({
        stage: Stage.CleaningUp,
        progress: stageProgress(Stage.CleaningUp),
      })
      events?.onLoadComplete?.()
    },
  }
  return listener
}
