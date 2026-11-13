/**
 * Where each mind verb takes the body (spec 2.7). The engine decides where: Merge reads, writes and answers at the desk at Home,
 * works at the bench in the Workshop, goes to the place it tends or revisits, and rests at Home. What the body does when it gets
 * there (the pose) is the species pack's `mindPoses`, so this names furniture and places, never an animal or one animal's bed.
 *
 * The names are the world's `spots`: a place's id, or the id of a kit part where it stands.
 */
const BY_VERB: Record<string, (target: string | undefined) => string[]> = {
  wander: () => ['desk', 'home'],
  write: () => ['desk', 'home'],
  reply: () => ['desk', 'home'],
  tinker: () => ['workbench', 'workshop', 'home'],
  tend: (target) => [target ?? '', 'home'],
  revisit: (target) => [target ?? '', 'home'],
  // Until a construction site exists (W6), building goes to the place it is about.
  expand: (target) => [target ?? '', 'home'],
  found: (target) => [target ?? '', 'home'],
  rest: () => ['home'],
}

/**
 * The first place a verb may go that the world has (`spots` are the names it offers), or nothing when it has none of them: a world
 * of the old island has no desk and no Home, and then the body keeps doing what it did. A step's target only counts for the verbs
 * that name a place (tend, revisit, expand, found); for the others it is a topic or an idea.
 */
export function stationFor(verb: string, target: string | undefined, spots: ReadonlySet<string>): string | undefined {
  const candidates = BY_VERB[verb]?.(target)
  return candidates?.find((name) => name !== '' && spots.has(name))
}
