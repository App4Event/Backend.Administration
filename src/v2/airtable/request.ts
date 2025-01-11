import { HttpApiFetch, HttpApiRequest } from '../http-api'

export const withApiKey = (apiKey: string, fetch: HttpApiFetch): HttpApiFetch => {
  return async (request: HttpApiRequest) => {
    return fetch({
      ...request,
      headers: {
        ...request.headers,
        Authorization: `Bearer ${apiKey}`,
      },
    })
  }
}
