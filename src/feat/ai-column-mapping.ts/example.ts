/**

AIRTABLE_BASE=x \
AIRTABLE_TABLE=x \
OPENAI_API_KEY=x \
npx tsx src/v2/feat/ai-column-mapping.ts/example.ts

 */

import { aiColumnMapping } from '.'
import { firestoreAiCache } from './firestore-ai-cache'

async function main() {
  const {
    OPENAI_API_KEY,
    AIRTABLE_API_KEY,
    AIRTABLE_BASE,
    AIRTABLE_TABLE,
  } = process.env
  const ai = aiColumnMapping.configure(
    {
      [String(AIRTABLE_TABLE)]: {
        name:
          'A short descriptive text that could be used as a name for English language.',
        description:
          'A longer text that could be used as a description for English language.',
        title:
          'A title. Something that would be used in a title tag for English language.',
        name_cs:
          'A short descriptive text that could be used as a name for Czech language.',
        description_cs:
          'A longer text that could be used as a description for Czech language.',
        title_cs:
          'A title. Something that would be used in a title tag for Czech language.',
        tags: 'A comma-separated list of tags.',
        images: 'A comma-separated list of image URLs.',
        facebook: 'A Facebook URL.',
        twitter: 'A Twitter URL.',
        youtube: 'A YouTube URL.',
        instagram: 'An Instagram URL.',
      },
    },
    String(AIRTABLE_API_KEY),
    String(AIRTABLE_BASE),
    String(OPENAI_API_KEY)
  )
  await aiColumnMapping.warmupCache(ai, {
    aiCache: firestoreAiCache,
  })
  console.log(Object.fromEntries(ai.cache.entries()))
  /**
   Example output:
   {
    'Artists:name': 'Name',
    'Artists:description': 'Bio (en)',
    'Artists:title': 'Title (en)',
    'Artists:name_cs': 'Name',
    'Artists:description_cs': 'Bio (cs)',
    'Artists:title_cs': 'Title (cs)',
    'Artists:tags': 'Tags',
    'Artists:images': 'Images',
    'Artists:facebook': 'Facebook',
    'Artists:twitter': 'Twitter',
    'Artists:youtube': 'Youtube',
    'Artists:instagram': 'Instagram'
  }
   */
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
