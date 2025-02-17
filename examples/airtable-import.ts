import { etl, airtable, Extract, httpApi } from '../build/cjs/app4event.cjs'

async function main() {
  /** The Airtable API key for authentication */
  const API_KEY = process.env.API_KEY
  /** The ID of the Airtable base to fetch schema from */
  const BASE_ID = process.env.BASE_ID

  if (!API_KEY || !BASE_ID) {
    throw new Error('API_KEY and BASE_ID are required')
  }

  // Using provided HTTP request function. Wrapped with caching.
  const request = httpApi.cached(httpApi.request)
  const extractPerformers: Extract = async () => {
    const rows = await airtable.findAllTableRows(
      BASE_ID,
      'Performers',
      API_KEY,
      request
    )
    return rows.map((row) => ({
      id: row.id,
      label: 'Performer',
      data: row,
    }))
  }

  const extraction = await etl.extractSources([extractPerformers])
  const transformed = await etl.transform(async (push) => {
    for (const id in extraction.storage.Performer) {
      const performer = extraction.storage.Performer[id]
      await push.performer({
        id: performer.id,
        language: 'en',
        data: performer,
      })
    }
  })
  await etl.loadToFirestore(transformed)
}

main()
