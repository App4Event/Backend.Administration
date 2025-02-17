import test, { describe } from 'node:test';
import { cached } from './cache';
import { equal } from 'assert';

describe('http-api/cache', () => {
  test('cached function caches only GET requests by default', async (t) => {
    const mockRequest = t.mock.fn(async (request) => {
      return {
        request,
        response: {
          status: 200,
          text: ''
        }
      }
    })
    const request = cached(mockRequest)
    await request({ method: 'GET', url: 'https://example.com' })
    equal(mockRequest.mock.calls.length, 1)
    await request({ method: 'GET', url: 'https://example.com' })
    equal(mockRequest.mock.calls.length, 1)
    await request({ method: 'POST', url: 'https://example.com' })
    equal(mockRequest.mock.calls.length, 2)
    await request({ method: 'POST', url: 'https://example.com' })
    equal(mockRequest.mock.calls.length, 3)
  })
})