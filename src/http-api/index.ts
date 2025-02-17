import { cached, clearCache } from './cache'
import { events } from './events'
import { request } from './request'
export type {
  HttpApiRequest,
  HttpApiResponse,
  HttpApiRoundtrip,
  HttpApiRequestFunction,
} from './request'

export type { HttpApiEvents } from './events'

export const httpApi = {
  request,
  events,
  cached,
  clearCache,
}
