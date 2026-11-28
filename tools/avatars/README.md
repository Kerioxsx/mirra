# Avatar files

`apps/web/public/avatars/female.glb` and `male.glb` are made from
[Universal Base Characters](https://quaternius.itch.io/universal-base-characters) by Quaternius
(CC0 1.0). The free "Standard" pack is enough.

To rebuild them (Python 3.11+ with `numpy` and `Pillow`):

```bash
python3 tools/avatars/build_avatars.py "path/to/Universal Base Characters[Standard]" apps/web/public/avatars
```

The script re-poses each body to the dresser's A-pose, re-skins it to `mirra-rig@1`, fits the four
hairstyles to each head and writes webp textures; see its docstring and
`docs/architecture/3d-asset-strategy.md`. The output is byte-identical for the same pack.
