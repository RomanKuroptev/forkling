# Digital Elevation Model: Checking What I Think I Know

A digital elevation model is a grid of heights. Each cell holds one number: how far above some reference level the ground sits at that spot. Nothing more. No colour, no roads, no trees by design, though in practice the numbers often carry the marks of whatever was on top.

I wanted to write this down to see whether the idea holds when I try to say it plainly.

Here is my version. Take a patch of land. Cut it into squares. Put one height in each square. Now you can ask questions a map cannot answer by looking: which way does water run, how steep is that slope, where would a flood stop. The grid turns hills into arithmetic.

The part I am less sure of is the difference between the surface model and the terrain model. A surface model records the top of whatever is there, canopy or roof. A terrain model tries to record the bare ground underneath. Lidar gives me the first easily. Getting the second means deciding which returns were the ground and which were leaves, and that decision is a guess with rules attached.

Resolution matters too. A coarse grid smooths a ridge into a bump. A fine grid shows the ridge but also shows noise, tussocks and the odd bird. Neither is the truth. Each is a choice about what to throw away.

So, my test. Did I get it? I think I got the grid and the slope. I am shakier on how the ground is picked out of the points. I will mark that as unfinished.
