import { logging } from '../logging'
import { HttpApiRequestError, HttpApiRoundtrip } from './request'
const log = logging.createModuleLogger('HTTP-API')

export interface HttpApiEvents {
  onFinished: (roundtrip: HttpApiRoundtrip) => void
  onError: (error: HttpApiRequestError, roundtrip: HttpApiRoundtrip) => void
}

const events: HttpApiEvents = {
  onFinished: (roundtrip) => {
    if (!roundtrip.response.error) {
      log.info(`${roundtrip.response.status} ${roundtrip.request.url}`, roundtrip)
    }
  },
  onError: (error, roundtrip) => {
    log.error(`${error.message} ${roundtrip.request.url}`, roundtrip)
  },
}

export { events }
