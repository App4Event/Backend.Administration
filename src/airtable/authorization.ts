import { HttpApiRequest, HttpApiRequestFunction } from '../http-api'

export const requestWithApiKeyAuthorization = (
  apiKey: string,
  makeApiRequest: HttpApiRequestFunction
): HttpApiRequestFunction => {
  return async (request: HttpApiRequest) => {
    return makeApiRequest({
      ...request,
      headers: {
        ...request.headers,
        Authorization: `Bearer ${apiKey}`,
      },
    })
  }
}
