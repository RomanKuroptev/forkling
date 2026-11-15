/** Spec 10.1: a visitor's name is up to 40 characters and a message up to 500. */
export const NOTE_NAME_MAX = 40
export const NOTE_MESSAGE_MAX = 500

/** Control characters (a tab and the line ends are handled apart), zero-width characters and text-direction overrides: they hide text from a reader. */
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g
const TLDS = 'com|org|net|io|dev|app|co|uk|se|de|ai|me|info|xyz|gov|edu|ly|gg|tv|html?'

/** Dates are numbers a note may keep, so they are set aside while phone numbers are taken out. */
const DATES = new RegExp(
  [
    String.raw`\b(?:19|20)\d{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])\b`,
    String.raw`\b(?:0?[1-9]|[12]\d|3[01])[./](?:0?[1-9]|1[0-2])[./](?:19|20)?\d{2}\b`,
    String.raw`\b(?:0?[1-9]|1[0-2])/(?:0?[1-9]|[12]\d|3[01])/(?:19|20)\d{2}\b`,
  ].join('|'),
  'g',
)
/** A run of digits with the spaces, dashes, dots and brackets a phone number is written with. */
const NUMBER_RUN = /(?<!\w)[+(]?\d[\d\s().-]{5,}\d(?!\w)/g

/**
 * Phone numbers (a note goes to a public repository): a run of at least 7 digits written with separators or after a plus sign, or
 * at least 9 in a row. Dates, times, years, counts, versions and short numbers stay.
 */
function withoutPhoneNumbers(text: string): string {
  const dates: string[] = []
  const masked = text.replace(DATES, (d) => `${dates.push(d) - 1}`)
  const stripped = masked.replace(NUMBER_RUN, (run) => {
    const digits = run.replace(/\D/g, '').length
    const needed = run.startsWith('+') || /[\s().-]/.test(run) ? 7 : 9
    return digits >= needed ? ' ' : run
  })
  return stripped.replace(/(\d+)/g, (_, i: string) => dates[Number(i)] ?? '')
}

/**
 * What code does to a visitor's text before anything reads it (spec 10.1): strips links, HTML, email addresses and phone numbers
 * (a note goes to a public repository), removes hidden characters, tidies the white space and cuts to the limit by characters
 * (never in the middle of an emoji). The text is data, so nothing is "fixed": a link is taken out and its words stay. Pure.
 * Only addresses and numbers written the usual ways are found; a person who spells one out in words is not caught.
 */
export function cleanNoteText(text: string, max: number): string {
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(HIDDEN, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-zA-Z!?][^>]*>?/g, ' ')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ')
    .replace(/\b(?:https?:\/\/|ftp:\/\/|www\.|mailto:|javascript:|data:)\S*/gi, ' ')
    .replace(new RegExp(String.raw`\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLDS})(?:\/\S*)?(?![\w@])`, 'gi'), ' ')
  const lines = withoutPhoneNumbers(cleaned)
    .split('\n')
    .map((line) => line.replace(/ +/g, ' ').trim())
  const tidy = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return Array.from(tidy).slice(0, max).join('').trimEnd()
}
