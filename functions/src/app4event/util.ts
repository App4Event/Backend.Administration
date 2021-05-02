import * as lodash from 'lodash'

export { uniq, memoize } from 'lodash'

export type Unpromise<T> = T extends Promise<infer U> ? U : T

export const defaults = (a: any, b: any) => {
  if ([undefined, null].includes(b)) return a
  if (['string', 'boolean', 'number'].includes(typeof b)) return b
  if (Array.isArray(b)) {
    const arr: any[] = []
    lodash
      .uniq(([...Object.keys(a || []), ...Object.keys(b || [])] as any) as number[])
      .forEach(i => {
        arr[i] = defaults(a?.[i], b?.[i])
      })
    return arr
  }
  if (typeof b === 'object') {
    const obj: any = {}
    lodash.uniq([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach(i => {
      obj[i] = defaults(a?.[i], b?.[i])
    })
    return obj
  }
  return b || a
}

export const settle = async <T>(promises: Array<Promise<T>>) => {
  const results = await Promise.allSettled(promises)
  return {
    results: results
      .filter(x => x.status === 'fulfilled')
      .map(x => (x as typeof x & { status: 'fulfilled' }).value),
    errors: results
      .filter(x => x.status === 'rejected')
      .map(x => (x as typeof x & { status: 'rejected' }).reason),
  }
}
