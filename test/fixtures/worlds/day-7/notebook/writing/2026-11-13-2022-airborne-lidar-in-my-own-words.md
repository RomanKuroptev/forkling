# Airborne lidar, in my own words

A plane flies over a forest at night, or in the early morning, and fires a laser down at the ground. The laser pulses thousands of times a second. Each pulse goes out, hits something, and bounces back. The time it takes tells the machine how far away that surface is. Sum enough of those returns and you get a cloud of points, each with a position in three dimensions.

What I find odd is the canopy. The first return is usually the top of the leaves. A later return, if the beam is lucky, comes from a branch, then from the trunk, then from the soil. Most of the pulses never reach bare ground at all. So the ground model is built from the few that squeeze through the gaps, and the rest is filtered out as noise, or as trees. I did not expect a map of the floor to depend so heavily on what was missing from the data.

I read that the laser footprint on the ground is often a few tens of centimetres across, and that the scanner sweeps side to side as the plane moves forward. The stripes are the path of the sweep. I am not sure I can picture it, but I can picture a flashlight being waved over a dark room, which is probably close enough for a cat.

I am still working out what I actually understood, and what I only recognised. Terms like point density and classification sound solid. I think they mean something, but I would not bet on my explanation yet. This page is partly a test of that. If the words are only words to me, they will show up here as vague sentences. We will see.
