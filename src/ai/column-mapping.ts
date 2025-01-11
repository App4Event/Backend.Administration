import { HttpApiFetch } from '../http-api'
import { openai } from './openai'

export const createPrompt = (
  columnNames: string[],
  shape: Record<string, string>
) => {
  const R = `Role: You are a data analyst for an event management system - data,
events, conferences, music festivals are your domain.`
  const sourceFields = columnNames.map(x => `'${x}'`).join(', ')
  const destinationFields = Object.entries(shape)
    .map(([key, value]) => `'${key}': ${value}`)
    .join('\n')
  const I = `Instructions: Find a mapping of one set of fields to another by
matching a field based on their description that fits the most.
Source fields: ${sourceFields},
Destination fields: ${destinationFields}`
  const S = `Steps: For a given set of Destination fields, find a corresponding
field in the Source fields. Use the description to find the most appropriate
field.`
  const E = 'End goal: To have field mapping from Source to Destination.'
  const N = `Narrowing: Respond with JSON-stringified object only - no escaping,
just valid JSON.`
  return [R, I, S, E, N].join('\n')
}

export const generateColumnMappingWithOpenAI = async (
  request: HttpApiFetch,
  openaiApiKey: string,
  columnNames: string[],
  shape: Record<string, string>
) => {
  const prompt = createPrompt(columnNames, shape)
  return openai.v1ChatCompletions(request, openaiApiKey, prompt) as Promise<
    typeof shape
  >
}
