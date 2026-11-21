**Judged as a code feed, by Roman's decision of 20 November 2026.** A dweet is a JavaScript program of at most 140 characters that draws on a canvas; it is a starting point for Merge's own works, and it is only seen by running it, which only the sandbox unit may do. So the trial counts a dweet readable when its code is present and non-empty (`hasCode` in `apps/mind/src/web/skip.ts`, the plan's `code: true` in `starts.ts`), and, as for any feed, "gives something" and "not boring" are shown but not marked. Readable is unchanged for every other host.

**Why this report was rewritten.** The first run (20 November, before Dwitter was on the allowlist) passed "readable" only because every dweet item carried a fixed sentence explaining what a dweet is (the canvas, the time t, the helper names). Without it, only 2 of those 20 dweets had 40 words of their own. That line is now removed from the items. A rerun on 20 November had every read call refused (the API credit was empty); this is the rerun of 21 November with credit.

**Rerun on 21 November 2026:** `source-trial www.dwitter.net --cap 0.1`, 20 dweets from 5 seeds, 47 requests, none refused, about $0.0032. robots.txt is a 404; read through /apiv2beta/ (the API the site's pages use). Packed dweets are unpacked by string functions, never run. The trial runs on a PC, not in the sandbox unit, so "it runs" is not measured; only "its code is there" is. The read prompt was not changed: the reactions below show the model reads a bare dweet as code without the explaining line. Many souvenirs are the makers' own titles or comments, and a few makers lead the hot list.

# Source trial: www.dwitter.net

Kind: record. Tier: voices. 20 items from 5 seeds. **Verdict on the numbers: pass** (as a code feed; see above). What only Roman can judge is marked "you".

| Check | Result | Mark | Pass |
|---|---|---|---|
| Allowed to read | www.dwitter.net has no robots.txt. Terms: Roman reads them | robots.txt allows the paths, terms allow reading or a public API, no login or paywall | yes |
| Reliable | 100% (20 of 20) | 95% or more | yes |
| Readable | 100% (20 of 20) | 80% have their code, present and non-empty (a code feed, Roman 20 November) | yes |
| Leads somewhere | 4.8 links on average | 4 or more | yes |
| Gives something | 55% (11 of 20) | not marked for a code feed: a dweet is a starting point for a work (Roman, 20 November) | you |
| Not boring | 5.4 out of 10 on average | not marked for a code feed: code is judged by running it, not by a read (Roman, 20 November) | you |
| Licences | no image souvenirs kept | 100% of images kept have a licence the code can read and allows | yes |
| Tier | voices | Roman assigns reference or voices (6.7) | you |

## 10 souvenirs, picked at random (11 kept in all)

- souvenir: "d/36696" (quote, from Dweet 36696 by taupelink, https://www.dwitter.net/d/36696)
- souvenir: "Double Spiral, Unwinding" (quote, from Dweet 36707 by rodrigo.siqueira, https://www.dwitter.net/d/36707)
- souvenir: "Gradient grid" (quote, from Dweet 36688 by rodrigo.siqueira, https://www.dwitter.net/d/36688)
- souvenir: "d/36685" (quote, from Dweet 36685 by taupelink, https://www.dwitter.net/d/36685)
- souvenir: "open the pod bay doors, u/taupelink" (quote, from Dweet 36691 by taupelink, https://www.dwitter.net/d/36691)
- souvenir: "Roller Coaster POV #3D" (quote, from Dweet 36693 by UEZ, https://www.dwitter.net/d/36693)
- souvenir: "`i=9` and it would have been a default" (quote, from Dweet 36665 by Axioplase, https://www.dwitter.net/d/36665)
- souvenir: "Fresnel lens over tiles" (quote, from Dweet 36697 by Axioplase, https://www.dwitter.net/d/36697)
- souvenir: "#night #grass" (quote, from Dweet 36672 by PotatoImaginator, https://www.dwitter.net/d/36672)
- souvenir: "Roller Coaster" (quote, from Dweet 36687 by UEZ, https://www.dwitter.net/d/36687)

## 10 reactions, picked at random (20 in all)

- reaction: Dweet 36674 by PotatoImaginator: A tiny animation of a sleepy emoji clocking in with a coffee cup sliding past. It is a joke that fits in one line of code, which I respect. Its charm is the small sad face cycling through tired states. It gave me a smile, not much more. (interest 4)
- reaction: Dweet 36685 by taupelink: A tiny JavaScript toy that paints a shifting dot pattern on a canvas, all from one line of code. Dense and strange, like a loom made of arithmetic. I like that someone squeezed this much picture into so few characters, though I can't tell yet what I'm looking at. (interest 6)
- reaction: Dweet 36703 by Axioplase: A tiny JavaScript animation: a grid of squares that pulse with cosine and sine waves, a little hypnotic lattice. Neat that a few lines of maths make something that moves. Not much more than that, but it did catch my eye for a second. (interest 5)
- reaction: Dweet 29531 by taupelink: A tiny JavaScript dweet that paints a dense, shifting pattern of squares on a canvas, all in about a hundred characters. I can't tell by eye what the maths is doing, which is part of the fun. It's a compact toy, and I'd like to poke at it to see what breaks. (interest 6)
- reaction: Dweet 36707 by rodrigo.siqueira: A tiny JavaScript spiral, a dweet, drawn with a few hundred dots. I can't fully parse the maths, which is a good sign: it's the kind of thing I'd want to tinker with. The result looks like a galaxy unwinding, and that's more than I expected from one line of code. Mildly delightful. (interest 6)
- reaction: Dweet 36690 by Axioplase: A tiny JavaScript dweet, 140 characters or so, that draws a rippling torus-like shape out of a grid of little squares by sine and cosine waves. Compact and strange, like a whole animation folded into a sentence. It gave me a small jolt of delight, but I am no expert on it and it is one of many similar tricks. (interest 6)
- reaction: Dweet 36693 by UEZ: A roller coaster drawn in about a line of packed JavaScript, and it still makes me want to lean into the turns. Squeezing a 3D ride into a few hundred characters is the sort of too-big trick I'd love to attempt and fail at. The comments are a good laugh too. (interest 7)
- reaction: Dweet 36672 by PotatoImaginator: A little JavaScript that hides its real code inside a pile of odd unicode, then unescapes it. Clever in a cheap way, and I like that it looks like a cat sat on the keyboard. The comment about night and grass is the only human bit, and it is nice. (interest 4)
- reaction: Dweet 36690 by Axioplase: A tiny JavaScript toy that draws a wobbly ring of pixels, pulsing as time goes by. Dense code, bright result. I like that someone packed a whole animated shape into one line. Mildly charmed, not blown away. (interest 6)
- reaction: Dweet 36665 by Axioplase: A tiny JavaScript toy: six bars sliding across a canvas in a loop, drawn with almost no code. Clever in a squashed way. Magna's comment about the default value made me smile. Not much more to it than that. (interest 5)

## Failures and skips


Spent about $0.0032.
