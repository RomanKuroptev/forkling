// Generates species/cat/model.glb. Run with `pnpm --filter @forkling/species-cat build:model`.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { buildCat } from '../src/buildCat.ts'

// GLTFExporter writes binary output through FileReader, which Node lacks.
class NodeFileReader {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null

  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    })
  }

  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`
      this.onloadend?.()
    })
  }
}
Object.assign(globalThis, { FileReader: NodeFileReader })

const { scene, clips } = buildCat()
const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips })) as ArrayBuffer
const out = fileURLToPath(new URL('../model.glb', import.meta.url))
writeFileSync(out, Buffer.from(glb))
console.log(`wrote ${out} (${glb.byteLength} bytes, ${clips.length} clips)`)
