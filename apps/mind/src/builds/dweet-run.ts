import type { Sandbox } from './sandbox-run.ts'
import { withPolicy } from './sandbox.ts'

/**
 * Running a dweet to see it (Roman, 20 November): a dweet is a stranger's code, so it runs only in the sandbox unit
 * (`sandbox.sandboxed === true`, spec-v4 4), never in this process; anywhere else a dweet is read as text only. The run gives a
 * screenshot that a look may see. The page carries the work policy (no network, no eval), so a packed dweet runs as the code it
 * unpacks to.
 */
export const DWEET_FRAME = 'dweets/run/index.html'
const DWEET_RUN_MS = 3_000

/** The page a dweet runs in: Dwitter's canvas, context and helpers, and the code as the body of u(t), called 60 times a second. */
export function dweetRunPage(code: string): string {
  // Code stays code: a "</script" inside it cannot end the script tag.
  const body = code.replace(/<\/(script)/gi, '<\\/$1')
  return withPolicy(
    `<!doctype html><html><head><meta charset="utf-8"><title>dweet</title><style>html,body{margin:0;background:#fff}canvas{display:block;width:100%;height:auto}</style></head><body><canvas id="c" width="1920" height="1080"></canvas><script>
var c=document.getElementById('c'),x=c.getContext('2d'),S=Math.sin,C=Math.cos,T=Math.tan,R=function(r,g,b,a){a=a===undefined?1:a;return 'rgba('+(r|0)+','+(g|0)+','+(b|0)+','+a+')'};
function u(t){
${body}
}
var frame=0;function loop(){var t=frame/60;frame++;try{u(t)}catch(e){}requestAnimationFrame(loop)}loop();
</script></body></html>`,
  )
}

/** A screenshot of the dweet running, or null: no sandbox unit here, or the run gave no picture. */
export async function renderDweet(sandbox: Sandbox | undefined, code: string): Promise<Buffer | null> {
  if (!sandbox || sandbox.sandboxed !== true) return null
  try {
    const run = await sandbox.run({ files: new Map([[DWEET_FRAME, Buffer.from(dweetRunPage(code))]]), frame: DWEET_FRAME }, { durationMs: DWEET_RUN_MS })
    return run.sandboxed && run.screenshotPng && run.screenshotPng.length > 0 ? run.screenshotPng : null
  } catch {
    return null
  }
}
