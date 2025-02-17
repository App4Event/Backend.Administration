import {
  HttpApiRequest,
  HttpApiRequestFunction,
  HttpApiRequestOptions,
  HttpApiRoundtrip,
} from './request'

const globalCache = new WeakMap<
  HttpApiRequestFunction,
  Map<string, Promise<HttpApiRoundtrip>>
>()

const defaultGetKey = (request: HttpApiRequest) => {
  return request.url
}

const shouldCache = (request: HttpApiRequest) => {
  return request.method === 'GET'
}

export const cached = (
  fn: HttpApiRequestFunction,
  getKey = defaultGetKey
): HttpApiRequestFunction => {
  if (!globalCache.has(fn)) {
    globalCache.set(fn, new Map<string, Promise<HttpApiRoundtrip>>())
  }
  const cache = globalCache.get(fn)!
  return async function cached(
    request: HttpApiRequest,
    options?: HttpApiRequestOptions
  ) {
    if (shouldCache(request)) {
      const key = getKey(request)
      if (cache.has(key)) {
        return cache.get(key)!
      }
      const response = fn(request, options)
      cache.set(key, response)
      return response
    }
    return fn(request, options)
  }
}

export const clearCache = (fn: HttpApiRequestFunction) => {
  globalCache.delete(fn)
}
