import { HttpApiFetch } from '../http-api'

export class AIError extends Error {
  constructor(public readonly innerError: unknown) {
    super(innerError instanceof Error ? innerError.message : String(innerError))
  }
}

const v1ChatCompletions = async (request: HttpApiFetch, openaiApiKey: string, prompt: string) => {
  const { response } = await request({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })
  if (response.status !== 200) {
    throw new AIError(response.text)
  }
  return JSON.parse(JSON.parse(response.text).choices[0].message.content)
}

export const openai = {
  v1ChatCompletions,
}
