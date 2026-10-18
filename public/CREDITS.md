# Asset credits

Downloaded assets are from Poly Haven and ambientCG, licensed CC0 1.0 (public domain).
License: https://polyhaven.com/license · https://creativecommons.org/publicdomain/zero/1.0/

## Oak Veneer 01 (2K)

https://polyhaven.com/a/oak_veneer_01

Diffuse (sRGB), OpenGL normal, roughness and ambient occlusion (linear).

## Studio Small 09 (1K HDR)

https://polyhaven.com/a/studio_small_09

Used for studio reflections and ambient illumination.

## Fabric 034 — felt (2K)

https://ambientcg.com/a/Fabric034

Charcoal-tinted felt scan: color (sRGB), OpenGL normal and roughness (linear), also used for the headphone cushions. License: https://docs.ambientcg.com/license/ — CC0 1.0.

Archive: https://ambientcg.com/get?file=Fabric034_2K-JPG.zip . Shipped members:

- `Fabric034_2K-JPG_Color.jpg` → `textures/felt/Fabric034_Color_2K.jpg`
- `Fabric034_2K-JPG_NormalGL.jpg` → `textures/felt/Fabric034_NormalGL_2K.jpg`
- `Fabric034_2K-JPG_Roughness.jpg` → `textures/felt/Fabric034_Roughness_2K.jpg`

## Exact download URLs

- `textures/wood/oak_veneer_01_diff_2k.jpg`: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/oak_veneer_01/oak_veneer_01_diff_2k.jpg — CC0 1.0
- `textures/wood/oak_veneer_01_nor_gl_2k.jpg`: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/oak_veneer_01/oak_veneer_01_nor_gl_2k.jpg — CC0 1.0
- `textures/wood/oak_veneer_01_rough_2k.jpg`: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/oak_veneer_01/oak_veneer_01_rough_2k.jpg — CC0 1.0
- `textures/wood/oak_veneer_01_ao_2k.jpg`: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/oak_veneer_01/oak_veneer_01_ao_2k.jpg — CC0 1.0
- `hdri/studio_small_09_1k.hdr`: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr — CC0 1.0


## Evaluated during development, not shipped

Wood Table 001 (2K), https://polyhaven.com/a/wood_table_001, CC0 1.0. Replaced after visual inspection with the calmer oak veneer. Maps downloaded from:

- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_table_001/wood_table_001_diff_2k.jpg — CC0 1.0
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_table_001/wood_table_001_nor_gl_2k.jpg — CC0 1.0
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_table_001/wood_table_001_rough_2k.jpg — CC0 1.0
- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_table_001/wood_table_001_ao_2k.jpg — CC0 1.0

Keyboard, desk and prop geometry, generic control-pad icon atlas, procedural satin-paint maps, wallpaper and UI are generated locally. No third-party logos or wordmarks are used. Reference photos in references/ were supplied by the project owner and are not redistributed as app assets.

## Sound effects — Kenney "UI Audio" and "Interface Sounds" (CC0 1.0)

Created/distributed by Kenney (www.kenney.nl). Both packs' bundled `License.txt`
reads "License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/".

- UI Audio: https://kenney.nl/assets/ui-audio — archive https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip
- Interface Sounds: https://kenney.nl/assets/interface-sounds — archive https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip

The `.ogg` files are the archive members, unmodified and renamed. Each `.mp3` is a
fallback encoded from that `.ogg` with ffmpeg/LAME (mono, 44.1 kHz, VBR q4).
Trimming, filtering, pitch and the synthesized body layers happen at runtime.

- `audio/key-down-1` ← UI Audio `Audio/switch15.ogg`
- `audio/key-down-2` ← UI Audio `Audio/switch17.ogg`
- `audio/key-down-3` ← UI Audio `Audio/switch22.ogg`
- `audio/key-down-4` ← UI Audio `Audio/switch16.ogg`
- `audio/key-up-1` ← UI Audio `Audio/switch26.ogg`
- `audio/key-up-2` ← UI Audio `Audio/switch28.ogg`
- `audio/key-up-3` ← UI Audio `Audio/switch12.ogg`
- `audio/cap-lift` ← UI Audio `Audio/switch13.ogg`
- `audio/knob-click` ← UI Audio `Audio/switch10.ogg`
- `audio/knob-tick` ← Interface Sounds `Audio/tick_001.ogg`
- `audio/hover-tick` ← Interface Sounds `Audio/click_003.ogg`
- `audio/soft-click` ← Interface Sounds `Audio/click_005.ogg`
