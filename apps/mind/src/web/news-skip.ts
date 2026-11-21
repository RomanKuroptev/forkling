/**
 * The news skip rule (Roman, 20 November 2026): Merge skips news about deaths, violence, war and politics. A rail, like the
 * safety rails of spec 12: code drops such an item before Merge is offered it. It is not a topic list for Merge to follow or
 * avoid in what it reads; it only applies where the web hands over the day's news: the "In the news" box on Wikipedia's Main
 * Page (Bluesky's trending topics, the other place it applied, left the list on 21 November). An ordinary page (a history article, say) is read as it is.
 *
 * Whole words only, any case: "war" and "killed" are caught, "Star Wars" and "award" are not. A phrase of two words matches
 * with any spaces between them.
 */
export const NEWS_SKIP_WORDS: readonly string[] = [
  // deaths
  'death', 'deaths', 'died', 'dies', 'dying', 'obituary', 'funeral', 'killed', 'kill', 'kills', 'killing', 'killings', 'murder', 'murdered', 'murders',
  'suicide', 'fatal', 'fatalities', 'casualties', 'passed away',
  // violence
  'violence', 'violent', 'shooting', 'shootings', 'gunman', 'stabbing', 'stabbed', 'attack', 'attacks', 'attacked', 'assault', 'bomb', 'bombs',
  'bombing', 'bombings', 'explosion', 'terror', 'terrorist', 'terrorists', 'terrorism', 'massacre', 'genocide', 'hostage', 'hostages', 'riot', 'riots',
  'assassination', 'assassinated',
  // war
  'war', 'warfare', 'wartime', 'invasion', 'invaded', 'airstrike', 'airstrikes', 'missile', 'missiles', 'troops', 'soldiers', 'military', 'army',
  'ceasefire', 'drone strike', 'drone strikes', 'shelling',
  // politics
  'politics', 'political', 'politician', 'politicians', 'election', 'elections', 'electoral', 'elected', 'vote', 'votes', 'voting', 'voters',
  'referendum', 'ballot', 'president', 'presidential', 'prime minister', 'minister', 'ministers', 'parliament', 'parliamentary', 'senate', 'senator',
  'congress', 'congressional', 'government', 'governor', 'cabinet', 'impeachment', 'impeached', 'coup', 'protest', 'protests', 'protesters',
  'sanctions', 'tariff', 'tariffs', 'democrat', 'democrats', 'republican', 'republicans', 'trump', 'biden', 'putin', 'supreme court', 'pardon',
  'pardoned', 'detained', 'detention', 'deported', 'deportation', 'immigration', 'eu', 'nato', 'mayor', 'mayoral',
]

const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${NEWS_SKIP_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'iu')

/** The skip word a piece of news has, or null. */
export function newsSkipWord(text: string): string | null {
  const m = pattern.exec(text)
  return m ? m[0].toLowerCase().replace(/\s+/g, ' ') : null
}

/** True when a piece of news is about deaths, violence, war or politics (whole words). */
export const isSkippedNews = (text: string): boolean => newsSkipWord(text) !== null
