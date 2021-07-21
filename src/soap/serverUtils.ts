export type Invoker = (impl, name, ...args) => any

export function proxy<T extends object>(target: T, invoker: Invoker, keys: string[]): T {
  const r = {...(target as any)}

  keys.forEach((key) => {
    r[key] = function (...args) {
      const impl = target[key]
      return invoker(impl, key, ...args)
    }
  })

  return r as any
}

export function proxify(target: object, invoker: Invoker, keys: string[]): void {
  keys.forEach((key) => {
    const impl = target[key]

    target[key] = function (...args) {
      return invoker(impl, key, ...args)
    }
  })
}

export function convertDateToString(message, format) {
  if (!message) return message

  Object.keys(message).forEach((key) => {
    const prop = message[key]

    if (typeof prop != "object") return

    if (prop instanceof Date) {
      message[key] = format(prop)
      return
    }

    if (!Array.isArray(prop)) return convertDateToString(prop, format)

    for (let i = 0; i < prop.length; i++) {
      convertDateToString(prop[i], format)
    }
  })

  return message
}

export function convertStringToDate(message, match, parse) {
  if (!message) return message

  Object.keys(message).forEach((key) => {
    const prop = message[key]

    if (!prop) return

    if (typeof prop == "string") {
      if (match(prop)) message[key] = parse(prop)

      return
    }

    if (typeof prop != "object") return

    if (!Array.isArray(prop)) return convertStringToDate(prop, match, parse)

    for (let i = 0; i < prop.length; i++) {
      convertStringToDate(prop[i], match, parse)
    }
  })

  return message
}

export const ISO8601 = /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d\d\dZ$/
export const ISO8601_secs = /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ$/
export const ISO8601_date = /^\d\d\d\d-\d\d-\d\d$/