/** Spec 10.1: a visitor's name is up to 40 characters and a message up to 500. */
export const NOTE_NAME_MAX = 40
export const NOTE_MESSAGE_MAX = 500

/** Control characters (a tab and the line ends are handled apart), zero-width characters and text-direction overrides: they hide text from a reader. */
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g
const TLDS = 'com|org|net|io|dev|app|co|uk|se|de|ai|me|info|xyz|gov|edu|ly|gg|tv|html?'

/**
 * What code does to a visitor's text before anything reads it (spec 10.1): strips links and HTML, removes hidden characters, tidies
 * the white space and cuts to the limit by characters (never in the middle of an emoji). The text is data, so nothing is "fixed":
 * a link is taken out and its words stay. Pure.
 */
export function cleanNoteText(text: string, max: number): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(HIDDEN, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-zA-Z!?][^>]*>?/g, ' ')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ')
    .replace(/\b(?:https?:\/\/|ftp:\/\/|www\.|mailto:|javascript:|data:)\S*/gi, ' ')
    .replace(new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?:\\/\\S*)?(?![\\w@])`, 'gi'), ' ')
    .split('\n')
    .map((line) => line.replace(/ +/g, ' ').trim())
  const tidy = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return Array.from(tidy).slice(0, max).join('').trimEnd()
}
