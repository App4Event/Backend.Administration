import * as lodash from 'lodash'
import * as events from 'events'
import sanitizeHtml from 'sanitize-html'

export { chunk, difference, uniq, memoize, countBy } from 'lodash'

export type Unpromise<T> = T extends Promise<infer U> ? U : T

export type ValueOf<T> = T[keyof T]

export const createDereferencerFrom = <
  TGetCollection extends (...args: any[]) => Promise<any[]>,
  TIteratee extends (item: TItem) => string | number,
  TItem = ReturnType<TGetCollection> extends Promise<Array<infer TItem>>
    ? TItem
    : never
>(
  getCollection: TGetCollection,
  getReferenceKey: TIteratee
) => {
  let idToItem: Record<keyof any, any> = {}

  async function warmup(...args: Parameters<TGetCollection>) {
    idToItem = lodash.keyBy(
      await getCollection(...args),
      getReferenceKey
    ) as any
  }
  function dereference(references: any[] | undefined | null) {
    if (!references) return []
    return references.map(x => (idToItem as any)[x]).filter(x => x) as TItem[]
  }
  return {
    dereference,
    warmup,
  }
}

export const defaults = (a: any, b: any) => {
  if ([undefined, null].includes(b)) return a
  if (['string', 'boolean', 'number'].includes(typeof b)) return b
  if (Array.isArray(b)) {
    const arr: any[] = []
    lodash
      .uniq(([
        ...Object.keys(a || []),
        ...Object.keys(b || []),
      ] as any) as number[])
      .forEach(i => {
        arr[i] = defaults(a?.[i], b?.[i])
      })
    return arr
  }
  if (typeof b === 'object') {
    const obj: any = {}
    lodash
      .uniq([...Object.keys(a || {}), ...Object.keys(b || {})])
      .forEach(i => {
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
 * + iteratee is not called with undefined or null and is skipped automatically
 * @param items
 * @param iteratee
 * @returns
 */
export const pluck = <TItem extends any, TRet extends any>(
  items: TItem[] | undefined | null,
  iteratee: (item: NonNullable<TItem>) => TRet
) => {
  if (!items) return [] as Array<NonNullable<TRet>>
  return lodash.uniq(
    items
      .map(item => {
        if (item === null || item === undefined) {
          return item
        }
        return iteratee((item as any) as NonNullable<TItem>)
      })
      .filter(x => x)
  ) as Array<NonNullable<TRet>>
}

/**
 *  Converts given value into Date if possible
 */
export const createDate = (value: any) => {
  if (!value) return
  const t = new Date(value)
  return isNaN(t.getTime()) ? undefined : t
}

export const createDomainProbe = <
  TEventToCreateData extends { [key: string]: (data: any) => any }
>(
  eventToCreateData: TEventToCreateData
) => {
  const ee = new events.EventEmitter()
  type Event = keyof TEventToCreateData
  type EventData = TEventToCreateData[Event]
  const emitMethods = (Object.keys(eventToCreateData) as Event[]).reduce(
    (method, event) => ({
      ...method,
      [event]: (data: EventData) =>
        ee.emit(event as string, eventToCreateData[event](data)),
      // eslint-disable-next-line
    }),
    {} as {
      [key in Event]: (
        ...params: Parameters<TEventToCreateData[key]>
      ) => ReturnType<typeof ee.emit>
    }
  )
  return {
    ...emitMethods,
    on: <T extends Event>(
      e: T,
      cb: (data: ReturnType<TEventToCreateData[T]>) => any
    ) => {
      // TODO Would be better to return the return variable, but see todo below
      ee.on(e as string, cb)
    },
    ee: ee as any /* TODO This breaks the code usage.. Exported variable 'probe' has or is using name 'EventEmitter' from external module "events" but cannot be named.ts(4023) */,
  }
}

export const stripHtml = (value: string) =>
  sanitizeHtml(value, {
    allowedTags: ['br'],
    allowedAttributes: {},
  }).replace(/<br ?\/?>/g, '\n')

export const createNumber = (x: any) => {
  if (isNaN(Number(x))) return
  return Number(x)
}
