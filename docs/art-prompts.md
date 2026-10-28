# Арт: промпты для ChatGPT (gpt-image)

Генерировать в ОДНОМ чате, по очереди. Каждое изображение — квадрат 1:1, сетка 4×4.
Готовые картинки положить в `assets/raw/` с именами `passengers-1.png`, `passengers-2.png`
(второй лист: 8 пассажиров + 8 контролёров). Нарезка и приведение к палитре — скриптом.

## Лист 1 — пассажиры 1–16

```
Square 1:1 image: a 4 by 4 sprite sheet of 16 pixel art character portraits for a mobile card game.
Layout: 16 equal square cells separated by thin pure black (#000000) gutters, one character per cell, head and shoulders, centered, same framing and scale in every cell.
Style: 16-bit pixel art with chunky visible pixels as if drawn on a 32x32 grid and scaled up, 1-pixel dark outline (#1a1424), flat dark indigo cell background (#17152f), limited palette: indigo #221f44 #433d7a, violet #7a2fd6 #b67cff, teal #1f6e6f #3fa197, amber #c9761a #ffb347, cream #f4ead2, red #d8344a. Neon rim light: violet from the left, amber from the right. Late-night post-Soviet city tram mood, a bit humorous.
Row 1: a stylish young man in a black and white striped scarf; an old man counting coins in his palm; a stern retired general with medals and a big cap; an elegant aristocrat with a monocle and cravat.
Row 2: a card player holding a fan of playing cards with a sly grin; a schoolgirl honor student with round glasses and a gold star badge; a nerdy man in huge glasses doing mental math; a sleepy university student with headphones and a notebook.
Row 3: a bearded professor with chalk dust and spectacles; identical twin sisters side by side; a minimalist man in a plain grey hoodie; a woman carrying a crate of seedlings for her dacha.
Row 4: a babushka in a headscarf holding a paper cone of sunflower seeds; a scruffy man with a bag of empty bottles; a traffic controller in a reflective vest with a striped baton; a mountain climber with a helmet and a coil of rope.
Constraints: no text, no letters, no numbers, no labels, no watermark, no frames except the black gutters.
```

## Лист 2 — пассажиры 17–24 и контролёры

```
Same style, palette, grid and framing as the previous image. A new 4 by 4 sprite sheet, square 1:1.
Row 1: an electrician in a yellow hard hat with a coiled cable; a grandpa holding old ceramic fuses with a proud smile; a power engineer with a glowing lightning badge; a wild-eyed young man holding an energy drink can.
Row 2: a muscular gym guy in a tank top; an old tram driver veteran in a uniform cap with medals; a commuter asleep with headphones on; a cheerful man playing an accordion.
Row 3 (stern ticket inspectors, reddish light instead of amber): a strict ticket inspector with a badge and a ticket puncher; a plump tram conductress with a ticket roll and a shoulder bag; a frosty man in a fur hat covered in icicles; a dark figure holding a flashlight in a blackout.
Row 4 (inspectors): a yawning new tram driver in uniform; a rail worker in an orange vest with a crowbar; a depot chief with a clipboard and a huge cap; a ghostly last-tram driver with glowing eyes holding a lantern.
Constraints: no text, no letters, no numbers, no labels, no watermark, no frames except the black gutters.
```
