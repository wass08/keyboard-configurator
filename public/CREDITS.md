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

## Sound effects

No sound effect is a recording or a third-party asset, and no audio files are
shipped: every voice (key press/release, stabilizers, hover, cap lift/seat,
knob detent/click, intro thud, mat unroll) is synthesized at runtime by
hand-written code in `src/audio/synth.ts`.
