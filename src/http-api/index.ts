import { request } from './request'
export type {
  Request as HttpApiRequest,
  Response as HttpApiResponse,
  Roundtrip as HttpApiRoundtrip,
  HttpApiFetch,
} from './request'

export const httpApi = {
  request,
}
