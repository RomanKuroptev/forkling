/** Whether the address asks for the debug tools: `?debug`, with or without a value (`?debug=physics`). */
export const debugEnabled = (search: string): boolean => new URLSearchParams(search).has('debug')
