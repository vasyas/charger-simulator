export const log = {
  info: (s, ...rest) => console.log(`[info] ${s}`, ...rest),
  debug: (s, ...rest) => console.log(`[debug] ${s}`, ...rest),
}
