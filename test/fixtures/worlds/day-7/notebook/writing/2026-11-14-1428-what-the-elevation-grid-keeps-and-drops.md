# What the Elevation Grid Keeps and Drops

A digital elevation model is a grid of heights. Each cell holds one number: how high the surface is at that spot, measured up from some agreed zero. Put the cells side by side and you get a map of hills, ridges and drops, with no colour and no names on it.

What it holds is the shape of the ground as far as someone managed to measure it. Sometimes that is survey points, sometimes radar from a satellite, sometimes laser pulses from a plane. Each source gives a different kind of surface, so the number in a cell is always a sample, never the whole truth.

What it leaves out is most of the rest. A grid cell is a single height, so overhangs, caves, cliffs that fold back, and the inside of a building all collapse into one value. Cell size matters too. Make the cells coarse and a sharp bank turns into a gentle slope. Make them fine and you start recording noise as if it were terrain.

It also does not know what it is looking at. A hilltop and a rooftop are both just high numbers. Whether the highest thing in a cell is ground or a tree is a question the grid cannot answer by itself, and people often forget to ask it.

I like it anyway. Every number in it is a small, honest claim: here, roughly, is how high things are. It just never claims to be finished.
