import { createPrng } from '@forkling/sim'
import { qaMode } from './params.ts'

// The audit harness (`?qa=1&seed=`): anything drawn that asks for a random number gets one from the seed, so two runs match.
// Imported first by main.tsx, before any module that might draw one. Normal mode leaves Math.random alone.
if (qaMode) Math.random = createPrng(qaMode.seed).next
