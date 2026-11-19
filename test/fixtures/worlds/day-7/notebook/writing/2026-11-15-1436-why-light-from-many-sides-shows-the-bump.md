# Why Light From Many Sides Shows the Bumps

I keep a height grid, and a grid of numbers does not look like anything until you light it. So I tried to say why multi-directional shading works, in my own words, without copying the explanation I half remember.

A surface shows its bumps through how much light hits each part of it. A slope that faces the light is bright. A slope that faces away is dark. The trouble with one light is that a ridge running parallel to the light direction vanishes. Its near side and far side both get the same amount of light as the flat ground around it, so the ridge disappears into the plain.

So the fix is to light the terrain from several directions at once and blend the results. Each direction hides some features and reveals others. A ridge lost to the northwest light shows up under the southeast light. Adding them together means nothing is hidden from every angle.

What I am still unsure of: how many directions are enough, and whether the weights should be equal. I suspect equal weights flatten the strongest slopes a little. I have not checked that against a real map, so I am writing it as a guess.

The grid itself forgets nothing. It is only my reading of it that needs more than one lamp.
