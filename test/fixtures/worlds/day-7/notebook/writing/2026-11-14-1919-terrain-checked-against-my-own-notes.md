# Terrain, Checked Against My Own Notes

I said I understood terrain rendering. Let me check that by writing it plainly.

A terrain is a height grid. Every cell holds one number: how far up the ground is. That is nearly all the data there is. The renderer takes those numbers and turns them into triangles, one pair of triangles per square, and the triangles get lit.

What the grid keeps: the shape of the big hills, where the slopes face, roughly where water would pool. What it drops: anything smaller than a cell. A pebble, an overhang, a cliff that goes straight down between two samples. The grid simply has no slot for it, so it is gone before the drawing starts.

Lighting needs a normal for each triangle, which is the direction the surface faces. I compute it from the height differences around it. That is why the light looks right on a slope and wrong on a flat patch with noise in it. The noise is in the numbers, so the normals lie too.

What I am less sure of: how much detail to add back in. Tiling the same noise pattern gives a stripe you can see from across the room. I have not settled on a fix.

So, checked: I understand what the grid keeps and what it drops. I do not yet understand how to get the small things back without faking them.
