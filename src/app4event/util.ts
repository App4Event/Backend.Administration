import * as lodash from 'lodash'

export { uniq, memoize, countBy } from 'lodash'

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

/**
 * Extract props from each item of the array.
 * + no falsy values in the result
 * + no repeated values in the result
 * + always array is returned
 * @param items
 * @param iteratee
 * @returns
 */
export const pluck = <TItem extends any, TRet extends any>(items: TItem[] | undefined, iteratee: (item: TItem) => TRet) => {
  if (!items) return [] as Array<NonNullable<TRet>>
  return lodash.uniq(items.map(iteratee).filter(x => x)) as Array<NonNullable<TRet>>
}

/**
 *  Converts given value into Date if possible
 */
export const createDate = (value: any) => {
  if (!value) return
  const t = new Date(value)
  return isNaN(t.getTime()) ? undefined : t
}
