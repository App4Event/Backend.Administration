import app4event from '../build/cjs/app4event.cjs'

async function main() {
  /** The Airtable API key for authentication */
  const API_KEY = process.env.API_KEY
  /** The ID of the Airtable base to fetch schema from */
  const BASE_ID = process.env.BASE_ID
  /** The ID or Name of the Airtable table to fetch rows from */
  const TABLE = process.env.TABLE
  if (!API_KEY || !BASE_ID || !TABLE) {
    throw new Error('API_KEY, BASE_ID and TABLE are required')
  }
  const rows = await app4event.airtable.findAllTableRows(BASE_ID, TABLE, API_KEY)
  console.dir(rows.slice(0, 1), { depth: null })
  /**
   Example:
   {
     id: 'rec123',
     createTime: 2024-05-17T08:59:40.000Z,
     fields: {
       name: 'John Doe'
     }
   }
   */
}

main()
