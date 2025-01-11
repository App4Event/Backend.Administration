import { logging } from '../logging'

const log = logging.createModuleLogger('HTTP-API')

class HttprequestError extends Error {
  constructor(public readonly innerError: unknown) {
    super(innerError instanceof Error ? innerError.message : String(innerError))
  }
}

export interface Request {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  headers?: Record<string, string>
}

export interface Response {
  error?: HttprequestError
  status: number
  text: string
}

export interface Roundtrip {
  request: Request
  response: Response
}

export const request = async (request: Request): Promise<Roundtrip> => {
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
    log.info(`${roundtrip.response.status} ${request.url}`, roundtrip)
    return roundtrip
  } catch (error) {
    const response = {
      error: new HttprequestError(error),
      status: 0,
      text: '',
    }
    log.info(`network-error ${request.url}`, { request, response })
    return {
      request,
      response,
    }
  }
}

export type HttpApiFetch = typeof request

const parseResponse = async (
  response: globalThis.Response
): Promise<Response> => {
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
      error: new HttprequestError(error),
    }
  }
}

export const httprequest = request
