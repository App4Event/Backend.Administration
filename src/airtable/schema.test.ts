import test, { describe } from 'node:test'
import { findBaseSchema, FindBaseSchemaError } from './schema'
import { deepEqual, rejects } from 'assert'

describe('airtable/schema', () => {
  test('findBaseSchema parses domain schema from api response', async (t) => {
    const mockRequest = t.mock.fn((request) =>
      Promise.resolve({
        request,
        response: {
          status: 200,
          text: JSON.stringify({
            tables: [
              {
                description: 'Apartments to track.',
                fields: [
                  {
                    description: 'Name of the apartment',
                    id: 'fld1VnoyuotSTyxW1',
                    name: 'Name',
                    type: 'singleLineText',
                  },
                  {
                    id: 'fldoaIqdn5szURHpw',
                    name: 'Pictures',
                    options: {
                      isReversed: false,
                    },
                    type: 'multipleAttachments',
                  },
                  {
                    id: 'fldumZe00w09RYTW6',
                    name: 'District',
                    options: {
                      inverseLinkFieldId: 'fldWnCJlo2z6ttT8Y',
                      isReversed: false,
                      linkedTableId: 'tblK6MZHez0ZvBChZ',
                      prefersSingleRecordLink: true,
                    },
                    type: 'multipleRecordLinks',
                  },
                ],
                id: 'tbltp8DGLhqbUmjK1',
                name: 'Apartments',
                primaryFieldId: 'fld1VnoyuotSTyxW1',
                views: [
                  {
                    id: 'viwQpsuEDqHFqegkp',
                    name: 'Grid view',
                    type: 'grid',
                  },
                ],
              },
              {
                fields: [
                  {
                    id: 'fldEVzvQOoULO38yl',
                    name: 'Name',
                    type: 'singleLineText',
                  },
                  {
                    description: 'Apartments that belong to this district',
                    id: 'fldWnCJlo2z6ttT8Y',
                    name: 'Apartments',
                    options: {
                      inverseLinkFieldId: 'fldumZe00w09RYTW6',
                      isReversed: false,
                      linkedTableId: 'tbltp8DGLhqbUmjK1',
                      prefersSingleRecordLink: false,
                    },
                    type: 'multipleRecordLinks',
                  },
                ],
                id: 'tblK6MZHez0ZvBChZ',
                name: 'Districts',
                primaryFieldId: 'fldEVzvQOoULO38yl',
                views: [
                  {
                    id: 'viwi3KXvrKug2mIBS',
                    name: 'Grid view',
                    type: 'grid',
                  },
                ],
              },
            ],
          }),
        },
      })
    )
    const schema = await findBaseSchema('apiKey', 'baseId', mockRequest)
    deepEqual(schema, {
      tables: [
        {
          name: 'Apartments',
          fields: [
            { name: 'Name' },
            { name: 'Pictures' },
            { name: 'District' },
          ],
        },
        {
          name: 'Districts',
          fields: [{ name: 'Name' }, { name: 'Apartments' }],
        },
      ],
    })
  })
  test('findBaseSchema throws error if api returns error', async (t) => {
    const mockRequest = t.mock.fn((request) =>
      Promise.resolve({
        request,
        response: {
          status: 400,
          text: 'error bruh',
        },
      })
    )
    await rejects(
      findBaseSchema('apiKey', 'baseId', mockRequest),
      FindBaseSchemaError
    )
  })
  test('findBaseSchema throws error if api throws error', async (t) => {
    const mockRequest = t.mock.fn(() => Promise.reject(new Error('test')))
    await rejects(findBaseSchema('apiKey', 'baseId', mockRequest), Error)
  })
})
