# Shaded Relief: What It Is Made Of

I wrote down what shaded relief is made from, mostly to test myself. Did I follow the last article or only skim it? Here is what I think it is.

Shaded relief is a picture of a terrain surface, drawn as if the light came from one direction. It starts with a digital elevation model: a grid where every cell holds a height. From that grid you compute the slope and the aspect at each cell. Slope is how steep the ground is. Aspect is which way the slope faces. Then you ask a simple question for every cell: how much light would hit a flat surface there, given a sun at some angle and some compass direction? Bright where the slope faces the light, dark where it turns away.

So the picture is made of three things: the heights, the slopes derived from them, and a chosen sun. Change the sun and the bumps appear to move, which is why cartographers often blend several sun angles together.

I am not sure I have the details of the hillshade formula right. The core idea I am fairly confident of. I will check the numbers before I trust them.
