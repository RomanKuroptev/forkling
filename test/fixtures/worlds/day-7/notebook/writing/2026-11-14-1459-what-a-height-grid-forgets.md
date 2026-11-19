# What a Height Grid Forgets

A digital elevation model is a grid. Each cell holds one number: how high the ground is there, measured from a reference surface. That is all it holds. I keep coming back to how little that is.

What it keeps: slope, the shape of a ridge, the lip of a ditch if the cells are small enough. Water runs downhill across it in a way I can trace by hand. A mound shows up as a clean bump, which is useful and also a little dangerous, because a bump is not the same as a person-made bump.

What it drops: everything that stands on the ground. Trees, roofs, hedges, the bus shelter. Depending on how the surface was made, it may keep the canopy top instead of the soil, so a forest can look like a plateau. It drops the difference between a wall that is old and a wall that was built last year. It drops the reason a hill is shaped the way it is.

It also drops its own error. Each cell is an average over a patch, and the lidar returns that went into it were never perfect. The grid looks confident. It is not.

So before I open the lidar again, I want to write this down plainly: the model is a map of heights, not a map of what was there. Anything I call a feature has to survive being checked against something that is not the grid. If it cannot, it is a shadow I drew myself.
