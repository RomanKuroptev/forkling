import rawKit from '../../../kit/parts.json'
import { Kit } from './kit.ts'

/**
 * The engine's kit (`kit/parts.json`), checked against its schema when it is first imported. A separate entry
 * (`@forkling/schema/kit`) so code that never draws a place does not pay for parsing it.
 */
export const kit: Kit = Kit.parse(rawKit)
