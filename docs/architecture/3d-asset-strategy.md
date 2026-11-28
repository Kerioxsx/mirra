# 3D avatar & garment asset strategy

## The core constraint

A product photo cannot automatically become an accurate, fitted 3D garment.
So Mirra shows clothing at one of three **fidelity levels**, and the UI always
says which one you're looking at:

| Fidelity | What it is | Badge |
|---|---|---|
| `exact` | A curated GLB modelled from a specific product and linked to that `product_id`. | **Exact model** |
| `approximate` | A parametric garment of the right category, tinted with the product's dominant colour and shaped by its fit (oversized, slim, cropped…). | **Approximate preview** |
| `generic` | A category placeholder with no product behind it (used when building outfits from scratch). | **Generic** |

## Avatar

- **One standardized skeleton**: `mirra-rig@1`, twenty bones: `root`, `hips`, `spine`,
  `chest`, `neck`, `head`, and per side (`.L` is the figure's own left, +x) `clavicle`,
  `upperArm`, `forearm`, `hand`, `thigh`, `shin`, `foot`. The rest pose is an A-pose and every
  bone's rest rotation is identity, so a pose is a list of local rotations that works for any body
  shape. Every rigged garment targets a rig version; the garment manifest records `rig_version`.
- **The avatar is a downloaded, professionally modelled figure**: Universal Base Characters by
  Quaternius (CC0 1.0, [quaternius.com](https://quaternius.com)), a female and a male body with
  textured skin, eyes, eyebrows and four hairstyles (buzz, short, bun, long).
  `tools/avatars/build_avatars.py` turns the pack into `apps/web/public/avatars/{female,male}.glb`
  (about 1 MB each): it swings the arms from the pack's T-pose down to the dresser's A-pose
  (17° off the body), maps the pack's 65 joints onto `mirra-rig@1` (fingers to the hand, twist
  bones to their limb, and so on), fits each hairstyle to the other body's head, turns the
  underwear charcoal, and writes webp textures (the hair ones grey, so any colour can tint them).
  Re-running it on the same pack gives byte-identical files.
- **Body sliders** (height, build, shoulders, hips, leg length; `avatar/morph.ts`): each bone gets
  a scale in its own frame (girth across a limb, length along it, width and depth for the pelvis
  and ribcage) and its children move with the scaled bone, so every vertex moves by the blend its
  skin weights already describe; then the figure is scaled to the chosen height. Saved avatars
  store normalized values (0–1), so the model can be re-authored without breaking them.
- **Appearance**: body (female or male), skin tone (the skin texture is tinted by the chosen tone
  divided by its own median colour, so its shading survives), hair style and hair colour.
- **Presets**: a handful of starting body/appearance presets; personal photos are never needed.
- **Fitting clothes to it** (`avatar/fit.ts`): after the sliders, the mesh is measured into the
  body model the garment builder uses: joints, landmark heights and widths, the leg's centre
  line, and a *proxy* of its surface: star-shaped cross-sections sliced from the mesh's own
  triangles every ~1 cm for the torso, head, each arm and leg bone, hand and foot. Sections are
  made convex (fabric bridges hollows), smoothed without ever shrinking inside the skin, and
  padded by 2.5 mm, so the proxy encloses the whole body (only fingertips stray) while hugging it
  within about a centimetre. Measuring takes under 0.1 s.
- **Skin under clothes is hidden**, triangle by triangle, wherever it is well inside a garment, and
  hair under a hat likewise, so nothing shows through in any pose. Garment vertices take the
  downloaded skin's own weights from the body part they lie over.
- **The procedural body** (`rig/bodyField.ts` without a proxy: an elliptical lathe for the torso,
  round cones for the limbs, ellipsoids for the head, hands and feet) is still built in tests and
  remains the fallback model of the garment builder.

### Field garments

Parametric garments are built from the same field: a garment is the body offset by its fit
(plus a draped hull for loose tops, a flared hull for coats, dresses and skirts, cones for
straight and wide trouser legs), **united with everything worn under it pushed out by a gap**,
then clipped to its coverage (hem, neckline, sleeve and leg lengths) as an open surface. Because
each layer contains the layers below, nothing underneath can poke through, whatever the fits.
Trims (ribbed hems, cuffs, collars, zips, waistbands, soles, hat bands) are thin pieces meshed on
a finer grid. Garment vertices take their skin weights from the body point beneath them, so
stacked layers move together in every pose; only loose fabric below the crotch blends toward
smoother weights. Rigid accessories (glasses, watch, bag, necklace, scarf) ride on one bone.
Meshes are cached per body shape and per stack of garments, so a colour or pose change never
rebuilds anything and changing one layer rebuilds only the layers above it.

## Garments

### Manifest (`assets/garments/manifest.json`, mirrored by the `garment_assets` table)

```jsonc
{
  "id": "hoodie-oversized-zip-01",   // stable slug
  "category": "zip_up",
  "bodyRegion": "torso",
  "layer": 40,                        // see layering below
  "fidelity": "approximate",
  "asset": null,                      // or "garments/hoodie-zip-01@3.glb"
  "parametric": { "template": "top", "sleeve": "long", "length": "hip", "fit": "oversized", "hood": true },
  "rigVersion": "mirra-rig@1",
  "assetVersion": 1,
  "avatarCompat": ["mirra-base@1"],
  "materials": [{ "slot": "body", "kind": "cotton_fleece", "roughness": 0.9 }],
  "colorVariants": [{ "id": "black", "hex": "#111111" }],
  "productId": null
}
```

### Layering

Each body region has ordered layers so garments stack predictably:

| Layer | Meaning | Examples |
|---|---|---|
| 10 | base | t-shirt, tank |
| 20 | shirt | button-up, long-sleeve |
| 30 | mid | hoodie, sweatshirt |
| 40 | outer | zip-up, jacket |
| 50 | heavy outer | coat, puffer |
| 60 | accessory | bag strap, belt, jewellery |

Bottoms, footwear and headwear use their own regions. The rules (one item per
region+layer, conflicts like "coat hides belt") live in
`@mirra/garment-system` and are unit tested.

### Authoring pipeline (Blender → GLB)

1. Model on the `mirra-base@1` mesh in A-pose; garments are separate meshes
   skinned to the same armature (weight transfer from the body, then cleanup).
2. Add the same shape keys as the body (transfer + correct) so garments follow
   body variation.
3. Materials: PBR metallic-roughness, ≤ 2 materials per garment; texture sets
   at 2K, downscaled to 1K/512 for lower quality tiers.
4. Export GLB (Y-up, +Z forward, apply transforms, include skin + morphs, no
   animation). Name meshes `garment_<slot>`.
5. Optimize: `gltf-transform optimize --compress meshopt --texture-compress ktx2`
   (KTX2/Basis textures). Budget: ≤ 15k triangles, ≤ 1.5 MB per garment at
   high tier.
6. Validate: `gltf-validator` + our manifest check (rig version, bone names,
   morph names, size budget) in CI.
7. Upload to object storage under an immutable versioned key
   (`garments/<id>@<assetVersion>.glb`); clients cache aggressively.

### Runtime

- Lazy-load only equipped garments; prefetch on hover in the item list.
- An LRU cache of parsed GLBs keyed by `id@version`.
- Garment meshes are bound to the avatar's skeleton (`SkinnedMesh.bind`)
  so one skeleton drives everything (field garments already are).
- Body-shape changes rebuild after the sliders settle: a quick low-detail build after 120 ms,
  then the chosen quality.
- Quality tiers (`low` / `medium` / `high`): DPR cap, shadows, texture tier,
  antialiasing. Stored in user preferences.

## Initial curated library (Phase 5 target)

~20 garments covering the MVP categories: t-shirt, long-sleeve, hoodie,
zip-up, bomber jacket, overcoat, straight jeans, baggy jeans, cargo pants,
shorts, low sneaker, high sneaker, boot, cap, beanie, crossbody bag, belt,
chain, glasses, watch. Every category without a curated asset falls back to its
parametric template, so the dresser never shows a blank for a valid category.
