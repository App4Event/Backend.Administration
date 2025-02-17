import app4event from '../build/cjs/app4event.cjs'

async function main() {
  /** The Airtable API key for authentication */
  const API_KEY = process.env.API_KEY
  /** The ID of the Airtable base to fetch schema from */
  const BASE_ID = process.env.BASE_ID

  if (!API_KEY || !BASE_ID) {
    throw new Error('API_KEY and BASE_ID are required')
  }
  const schema = await app4event.airtable.findBaseSchema(API_KEY, BASE_ID)
  console.dir(schema, { depth: null })
  /**
   Example:
    {
      tables: [
          {
          name: 'Sheet 1',
          fields: [
            { name: 'Column_1' },
          ]
        }
      ]
    }
   */
}

main()
