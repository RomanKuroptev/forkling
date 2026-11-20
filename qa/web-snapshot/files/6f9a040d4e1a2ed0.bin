# Past Forever

**Write a loop that never ends. Get its answer anyway, exactly.** This loop never stops, and the program runs on past it:

```
x = 5
forever: x = x × x
show x
```

```
…918212890625
```

5, 25, 625, 390625… squared forever, and the digits on the right freeze. **Check it on any calculator:**
`90625 × 90625 = 8212890625`, which ends in `90625` again. Every digit you keep does the same. It is its own square.
Numbers whose digits run on forever to the left are old maths, the 10-adic numbers (Hensel, 1897). Past Forever lets
you write loops in them.

<p align="center"><img src="media/hero.gif" width="460" alt="5 squared again and again: the digits on the right freeze one or more at a time, and Past Forever gives the final ending ...918212890625"></p>

**Try it in 10 seconds** (Node 18+, no dependencies):

```
git clone https://github.com/connabyss/past-forever && cd past-forever
node cli.js examples/graham.txt     # …262464195387, the end of Graham's number
```

Same trick, other answers: `1 ÷ 7 = …142857143` (check: `142857143 × 7 = 1000000001`, and the more 142857s you
add, the more zeros), and the last digits of [Graham's number](GUIDE.md#the-last-digits-of-grahams-number), which you can
[hear played on a paper piano roll](https://connabyss.github.io/past-forever/sing.html).

**Two numbers, neither one zero, that multiply to exactly 0.** Run a second loop, `y = 6` then
`forever: y = y ^ 5`, and it settles to `…081787109376`. Now `show x × y` prints `0`, and `show x + y` prints
`1`. Check the last 4 digits by hand: `0625 × 9376 = 5860000` (four zeros) and `0625 + 9376 = 10001`. Take more
digits and you get more zeros. In these numbers, 0 has two non-zero factors (`node cli.js examples/zero_twins.txt`, or tap the second wonder in
the [playground](https://connabyss.github.io/past-forever/)).

**What it can and can't do.** Past Forever answers loops of plain arithmetic on one or a few numbers: adding,
multiplying, fractions, powers, tests like `is even`. For each it either proves the answer, proves the loop never
settles, or says `can't see the end`. It does not solve any infinite program you could write, and it tells you
when it can't.

**Words you'll see.**
- **settles**: the digits on the right freeze, one more after another, so the loop has a finished endless answer.
- **ring of N**: the last digits keep coming round the same N values forever, so it never settles.
- **goes wild**: each extra digit you look at takes 5 times as long to come round, so it never settles.
- **liar**: looks like a ring for many digits, then goes wild.

**Found with it: loops that lie.** Run `x = x × x + c` from 0. Most choices of c either settle or go wild fast. A
**liar** looks settled for a while: its last digits keep coming round in a small ring, digit after digit, and then
one more digit breaks the pattern and it goes wild. The record liars, each calm for more digits than every smaller
c, go 2, 7, 57, 182, 1068, 14557, … and the list runs to 1000 digits of calm.

<details><summary>Check one yourself, in plain Python: c = <code>38533618339183472936432</code> stays calm for 35 digits</summary>

```python
c = 38533618339183472936432
for k in (34, 35, 36, 37):                    # look at the last k digits
    m, x, seen = 10**k, 0, {}
    while x not in seen:
        seen[x] = len(seen); x = (x * x + c) % m
    print(k, "digits come round every", len(seen) - seen[x], "steps")
# 34: 8,  35: 8,  then 36: 40,  37: 200, and ×5 for every digit after that
```

</details>

Why they lie, the four special numbers ("magnets") every liar sits close to, liars of other powers, and how the records were found:
[liars/README.md](liars/README.md).

<p align="center"><a href="https://connabyss.github.io/past-forever/"><img src="media/try-it-now.svg" width="300" alt="Try it now: open the playground in your browser"></a></p>

<p align="center">or take the <a href="https://connabyss.github.io/past-forever/#wonders">Wonders tour</a>: 7 surprises, one tap each</p>

## The whole language on one screen

```
x = 5                          a name and a number
forever: x = x × x             run it without end (lines pushed in below work too)
show x                         the endless answer; show 40 digits of x; why x says how it knows
count n = 0                    a count that can go past forever
repeat 10: n = n + 1           a fixed number of steps
if x ends in 7: found = yes    also is even, is odd, =, <, >, with else:
3 ^ x   x ^ 5   mod   /        towers, powers, remainders, dividing (by anything with no 2 or 5 in it)
sing 360 digits of x           its digits as music
hunt c from 0 to 99:           run the lines below once for every c, and sort them by answer
```

## Three honest answers

Every value that comes out of a forever loop is one of three things:

| answer | example | what it printed |
|---|---|---|
| a number, with proof | add 9, 90, 900, … forever | `…999999999999  (this is -1)` |
| **never settles**, with proof | `x = 6`, square forever | `never settles` (the last two digits go 36, 96, 16, 56 forever) |
| **can't see the end** | 196, reverse and add forever | `can't see the end` |

Searches work the same way. "Does some square end in 7?" answers `no  (proved)` after looking at infinitely many
squares. Counts can go past forever too: count to forever, add one, and you get `forever + 1`.

**A word on `proved`.** It means proved by the engine's own hand-written rules, listed in
[HOW_IT_KNOWS.md](HOW_IT_KNOWS.md). No mathematician has reviewed them and no proof assistant has checked them. A
separate checker that shares no code with the engine proves many answers a second time on every build, and a robot
referee ([tests/referee.js](tests/referee.js)) tries thousands of random loops against plain arithmetic: strong checks, not proofs. HOW_IT_KNOWS.md marks which answers get which.

## Hall of Fame

**[Finds](HALL_OF_FAME.md#finds):** three lists found with Past Forever that aren't in the OEIS, the record liars of
`x × x + c` and of `x ^ 4 + c`, and the whole-number answers of endless sums of squared factorials. Each comes with a
check in plain Python.

**[Breakers](HALL_OF_FAME.md#breakers):** find a loop where Past Forever says `proved` and is wrong, and your name goes
here. Nine are there already, most of them AI agents that found real gaps, each linked to its fix. There are
standing dares too, like the 10,000-digit liar: [BREAK_IT.md](BREAK_IT.md).

## More

- [Try this on a calculator first](CALCULATOR.md): seven steps, two minutes, no maths needed.
- [A tour of the language](GUIDE.md): four lines that square forever, the last digits of Graham's number (and a
  song made of them), and `hunt`, which tries a whole range of loops at once.
- [Liars](liars/README.md): why they lie, the records, and which powers can lie.
- [How it knows](HOW_IT_KNOWS.md): every rule behind a `proved`, and honest notes on what is and isn't checked.

## Run it

You need Node.js 18 or newer. There are no dependencies.

```
git clone https://github.com/connabyss/past-forever && cd past-forever
node cli.js examples/own_square.txt --why
node tests/run.js        # ok: 690 checks
node tests/referee.js    # the robot referee, about 5 minutes
node tests/certify_gen.js 300 2027 | python3 tests/certify.py   # the second opinion, about a minute
```

The playground is one file, [docs/index.html](docs/index.html), and the piano roll is [docs/sing.html](docs/sing.html). Rebuild both
with `python3 page/build.py`. `node tests/sing.js` checks the piano roll in a browser (it needs Playwright).

## A sister language: PARADOX

[paradox/](paradox/) is a second, separate experiment: a language with time travel. Write `x = future(x)` and x
starts as the value it will have when the program ends. PARADOX keeps only the timelines that don't contradict
themselves: it factors numbers by "receiving the answer from the future", catches the grandfather paradox, and finds
the one 10-digit number that describes itself, `6210001000`. It runs on Python and the z3 solver, not on forever.js.

## Where it came from

connabyss asked Claude (an AI) for a strange new language that would grow out of playing with numbers.
One idea from that play was a loop that finishes forever, and connabyss picked it. The language was built in a day
with Claude Code, and the liar loops turned up while hunting with it.

MIT licence. The piano roll's paper is Paper 001 from [ambientCG](https://ambientcg.com/view?id=Paper001), CC0.
