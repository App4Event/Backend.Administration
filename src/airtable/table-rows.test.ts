import { deepEqual } from 'node:assert'
import test, { describe } from 'node:test'
import {
  findAllTableRows,
  listTableRecords,
  ListTableRecordsResponse,
} from './table-rows'
import { equal } from 'assert'

describe('airtable/table-rows', () => {
  test('listTableRecords passes api key authorization', async (t) => {
    const mockRequest = t.mock.fn((request) =>
      Promise.resolve({
        request,
        response: {
          status: 200,
          text: JSON.stringify({
            records: [],
          }),
        },
      })
    )
    await listTableRecords('baseId', 'tableId', 'apiKey', mockRequest)
    equal(
      mockRequest.mock.calls[0].arguments[0].headers.Authorization,
      'Bearer apiKey'
    )
  })
  test('listTableRecords calls url without offset', async (t) => {
    const mockRequest = t.mock.fn((request) =>
      Promise.resolve({
        request,
        response: {
          status: 200,
          text: JSON.stringify({
            records: [],
          }),
        },
      })
    )
    await listTableRecords('baseId', 'tableId', 'apiKey', mockRequest)
    equal(
      mockRequest.mock.calls[0].arguments[0].url,
      'https://api.airtable.com/v0/baseId/tableId'
    )
  })
  test('listTableRecords calls url with offset', async (t) => {
    const mockRequest = t.mock.fn((request) =>
      Promise.resolve({
        request,
        response: {
          status: 200,
          text: JSON.stringify({
            records: [],
          }),
        },
      })
    )
    await listTableRecords('baseId', 'tableId', 'apiKey', mockRequest, 'offset')
    equal(
      mockRequest.mock.calls[0].arguments[0].url,
      'https://api.airtable.com/v0/baseId/tableId?offset=offset'
    )
  })
  test('findAllTableRows paginates listTableRecords until all rows are fetched', async (t) => {
    const responses: ListTableRecordsResponse[] = [
      {
        offset: 'offset1',
        records: [{ id: '1', createdTime: '2021-01-01T00:00:00Z', fields: {} }],
      },
      {
        offset: 'offset2',
        records: [{ id: '2', createdTime: '2021-01-01T00:00:00Z', fields: {} }],
      },
      {
        offset: undefined,
        records: [{ id: '3', createdTime: '2021-01-01T00:00:00Z', fields: {} }],
      },
    ]
    let calls = 0
    const mockRequest = t.mock.fn((request) =>
      Promise.resolve({
        request,
        response: {
          status: 200,
          text: JSON.stringify(responses[calls++]),
        },
      })
    )
    const rows = await findAllTableRows(
      'baseId',
      'tableId',
      'apiKey',
      mockRequest
    )
    equal(calls, responses.length)
    equal(
      mockRequest.mock.calls[0].arguments[0].url,
      'https://api.airtable.com/v0/baseId/tableId'
    )
    equal(
      mockRequest.mock.calls[1].arguments[0].url,
      'https://api.airtable.com/v0/baseId/tableId?offset=offset1'
    )
    equal(
      mockRequest.mock.calls[2].arguments[0].url,
      'https://api.airtable.com/v0/baseId/tableId?offset=offset2'
    )
    deepEqual(rows, [
      { id: '1', createTime: new Date('2021-01-01T00:00:00Z'), fields: {} },
      { id: '2', createTime: new Date('2021-01-01T00:00:00Z'), fields: {} },
      { id: '3', createTime: new Date('2021-01-01T00:00:00Z'), fields: {} },
    ])
  })
})
