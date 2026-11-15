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
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.02, 0.65]} />
            <meshStandardMaterial color={m.color} />
          </mesh>
          {/* A roomy invisible target, so a small paper is easy to point at and to click. */}
          <mesh position={[0, 0.2, 0]} onClick={() => notesStore.open(m.id)} onPointerOver={() => hoverStore.set({ title: m.title, text: m.text })} onPointerOut={() => hoverStore.set(null)}>
            <boxGeometry args={[0.9, 0.5, 0.9]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
