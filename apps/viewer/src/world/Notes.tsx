import { useMemo } from 'react'
import { hoverStore } from './hoverStore.ts'
import { noteMarks } from './noteMarks.ts'
import { notesStore, useNotes } from './notesStore.ts'
import { useWorld } from './WorldContext.tsx'
import { worldLand } from './worldLand.ts'

/** The paper notes visitors left (spec 10.1), lying where each was written. Pointing at one says who left it and what became of it; a click opens it. */
export function Notes() {
  const { world } = useWorld()
  const notes = useNotes()
  const land = useMemo(() => worldLand(world), [world])
  const marks = useMemo(() => noteMarks(notes, world.places, (x, z) => land.heightAt(x, z)), [notes, world.places, land])
  return (
    <>
      {marks.map((m) => (
        <group key={m.id} position={m.position} rotation={[0, m.rotY, 0]}>
          {/* A dark edge under a bright, glowing sheet, so a paper stands out from the grass at a distance. */}
          <mesh position={[0, -0.005, 0]}>
            <boxGeometry args={[0.98, 0.02, 1.26]} />
            <meshStandardMaterial color="#3a3224" />
          </mesh>
          <mesh position={[0, 0.012, 0]} castShadow>
            <boxGeometry args={[0.86, 0.03, 1.14]} />
            <meshStandardMaterial color={m.color} emissive={m.color} emissiveIntensity={0.55} />
          </mesh>
          {/* A roomy invisible target, so a small paper is easy to point at and to click. */}
          <mesh position={[0, 0.2, 0]} onClick={() => notesStore.open(m.id)} onPointerOver={() => hoverStore.set({ title: m.title, text: m.text })} onPointerOut={() => hoverStore.set(null)}>
            <boxGeometry args={[1.4, 0.6, 1.4]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
