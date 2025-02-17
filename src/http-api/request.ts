import { events, HttpApiEvents } from './events'

export class HttpApiRequestError extends Error {
  constructor(public readonly innerError: unknown) {
    super(innerError instanceof Error ? innerError.message : String(innerError))
  }
}

export interface HttpApiRequest {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  headers?: Record<string, string>
}

export interface HttpApiResponse {
  error?: HttpApiRequestError
  status: number
  text: string
}

export interface HttpApiRoundtrip {
  request: HttpApiRequest
  response: HttpApiResponse
}

export interface HttpApiRequestOptions {
  events?: HttpApiEvents
}

export const request = async (
  request: HttpApiRequest,
  options?: HttpApiRequestOptions
): Promise<HttpApiRoundtrip> => {
  const ee = options?.events ?? events
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })
    const roundtrip = {
      request,
      response: await parseResponse(response),
    }
    ee.onFinished(roundtrip)
    return roundtrip
  } catch (error) {
    const response = {
      error: new HttpApiRequestError(error),
      status: 0,
      text: '',
    }
    ee.onFinished({ request, response })
    ee.onError(new HttpApiRequestError(error), { request, response })
    return {
      request,
      response,
    }
  }
}

export type HttpApiRequestFunction = typeof request

const parseResponse = async (
  response: globalThis.Response
): Promise<HttpApiResponse> => {
  try {
    if (response.headers.get('content-type')?.includes('application/json')) {
      return {
        status: response.status,
        text: await response.text(),
      }
    }
    throw new Error('Unsupported content type')
  } catch (error) {
    return {
      status: response.status,
      text: '',
      error: new HttpApiRequestError(error),
    }
  }
}
