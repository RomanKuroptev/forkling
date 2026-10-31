import type { BatchOutcome, LlmClient } from '../src/llm.ts'

/** For fakes of tests that never reach the Batch API. */
export const noBatch: Pick<LlmClient, 'submitBatch' | 'fetchBatch'> = {
  async submitBatch() {
    throw new Error('this test does not expect a batch')
  },
  async fetchBatch(): Promise<BatchOutcome> {
    return { status: 'pending' }
  },
}
