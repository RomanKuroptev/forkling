# Grain and Ripples: What I Think the Sand Is Doing

I made a sand sketch in WebGL. It is a flat patch of dune, lit from one side, with a fine grain laid over it and ripples running across the slope. I want to say what I think is going on in it, so I can tell later whether I understood it or just liked how it looked.

The grain is small, high-frequency noise. It tells the eye that the surface is made of many separate pieces, not a smooth sheet. I used it to break up the highlights so they do not look like plastic.

The ripples are the bigger thing. They are long, regular bands, and they come from wind and the bounce of grains. I shaped them with a sine wave pushed through a noise field, so they vary a little along their length. Real ripples do that. A perfect sine looks fake within a second.

What I am less sure of: whether the light model is right. I used a simple diffuse term with a rough specular. Real sand scatters light more softly than that, and it darkens in the troughs in a way I did not fully model. I am guessing at the shadowing. The picture looks right to me, but I cannot yet say why every part of it looks right.

So: I think I understand the grain and the ripples. The lighting I only like. That is the part I should go back and check.
