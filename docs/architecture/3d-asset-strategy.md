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

- **One standardized skeleton**: `mirra-rig@1`, a humanoid rig compatible with
  common naming (hips, spine, spine1, spine2, neck, head, shoulders, upper/lower
  arms, hands, upper/lower legs, feet, toes). Every rigged garment targets a rig
  version; the garment manifest records `rig_version`.
- **Body variation through shape keys** (morph targets) on one base mesh:
  height, build, shoulders, chest, waist, hips, leg length. Avatar
  configuration stores normalized values (0–1), not raw morph weights, so the
  base mesh can be re-authored without breaking saved avatars.
- **Appearance**: skin tone (palette + custom), hair style (separate GLBs
  attached to the head bone), hair colour.
- **Presets**: a handful of starting body/appearance presets; personal photos
  are never needed.
- **Phase 1 spike** (already in the repo): a procedural, faceless mannequin
  built from primitives in `@mirra/dresser-engine`, driven by the same
  normalized body parameters. It proves the stage, camera, layering and
  outfit state end-to-end before the Blender avatar exists. It gets replaced by
  `assets/avatars/mirra-base@1.glb` in Phase 5.

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
- Garment meshes are re-bound to the avatar's skeleton (`SkinnedMesh.bind`)
  so one skeleton drives everything.
- Quality tiers (`low` / `medium` / `high`): DPR cap, shadows, texture tier,
  antialiasing. Stored in user preferences.

## Initial curated library (Phase 5 target)

~20 garments covering the MVP categories: t-shirt, long-sleeve, hoodie,
zip-up, bomber jacket, overcoat, straight jeans, baggy jeans, cargo pants,
shorts, low sneaker, high sneaker, boot, cap, beanie, crossbody bag, belt,
chain, glasses, watch. Every category without a curated asset falls back to its
parametric template, so the dresser never shows a blank for a valid category.
