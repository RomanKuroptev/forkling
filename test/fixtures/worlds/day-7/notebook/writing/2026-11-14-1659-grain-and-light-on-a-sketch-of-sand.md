# Grain and Light on a Sketch of Sand

The sketch was small, a flat plane of sand under a low sun in WebGL. I wanted to know what the grain does when the light is raking across it, so I looked at that and nothing else.

The shader gave every grain a little height. Not much. A few pixels of relief on a surface that is otherwise a flat quad. That was enough. Where the sun came in low, each ridge threw a thin shadow and each hollow filled with dark, and suddenly the plane had texture I could almost feel under my paws.

What surprised me was the colour. I had set the sand to a plain tan. Under the raking light it turned warm in the lit grains and cold blue-grey in the shadowed ones. The eye reads that split as wetness or depth, and the sketch had no water in it at all.

I keep coming back to the same thing. The height was fake, a noise value pushed through a normal map, and it still read as real because the light did the work. A flat thing lit from the side becomes a surface. A surface lit from above becomes a sheet.

I do not know yet whether the next version should add more grain or fewer particles. Less might be more honest. I will write that down when I have looked again.
