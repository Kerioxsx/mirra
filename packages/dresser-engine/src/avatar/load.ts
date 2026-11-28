"use client";
/**
 * Loading the downloaded avatar in the browser: fetch and parse its file once per URL, and make its
 * textures and materials (skin and hair tinted to the chosen colours, the textures' own shading
 * kept).
 */
import { useEffect, useState } from "react";
import {
  Color,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import { parseAvatar, type AvatarAsset } from "./asset";

const files = new Map<string, Promise<AvatarAsset>>();

export function loadAvatar(url: string): Promise<AvatarAsset> {
  let p = files.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`avatar ${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(parseAvatar);
    p.catch(() => files.delete(url)); // let a later attempt retry
    files.set(url, p);
  }
  return p;
}

export type AvatarState =
  | { status: "loading" }
  | { status: "ready"; asset: AvatarAsset }
  | { status: "error"; error: string };

export function useAvatarAsset(url: string): AvatarState {
  const [state, setState] = useState<{ url: string; state: AvatarState }>({
    url,
    state: { status: "loading" },
  });
  useEffect(() => {
    let live = true;
    loadAvatar(url).then(
      (asset) => live && setState({ url, state: { status: "ready", asset } }),
      (err: unknown) => live && setState({ url, state: { status: "error", error: String(err) } }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  // a new URL is loading until its own result arrives
  return state.url === url ? state.state : { status: "loading" };
}

const textures = new WeakMap<AvatarAsset, Texture[]>();

function texturesOf(asset: AvatarAsset): Texture[] {
  let list = textures.get(asset);
  if (!list) {
    const loader = new TextureLoader();
    list = asset.images.map((im) => {
      const url = URL.createObjectURL(new Blob([im.bytes as BlobPart], { type: im.mime }));
      const t = loader.load(url, () => URL.revokeObjectURL(url));
      t.flipY = false; // glTF's texture origin is the top left
      t.anisotropy = 4;
      return t;
    });
    textures.set(asset, list);
  }
  return list;
}

/** The colour to multiply a texture by so its own colour (`ref`) comes out as `hex`. */
export function tintFor(hex: string, ref: string | number | undefined): Color {
  const want = new Color(hex);
  if (ref === undefined) return want;
  const base =
    typeof ref === "number" ? new Color().setRGB(ref, ref, ref, SRGBColorSpace) : new Color(ref);
  return new Color(
    Math.min(4, want.r / Math.max(base.r, 1e-3)),
    Math.min(4, want.g / Math.max(base.g, 1e-3)),
    Math.min(4, want.b / Math.max(base.b, 1e-3)),
  );
}

const materials = new WeakMap<AvatarAsset, Map<string, MeshStandardMaterial>>();

/** A material of the avatar's file, tinted (skin and hair) to `hex`. Cached. */
export function avatarMaterial(
  asset: AvatarAsset,
  index: number,
  hex: string,
): MeshStandardMaterial {
  let byKey = materials.get(asset);
  if (!byKey) {
    byKey = new Map();
    materials.set(asset, byKey);
  }
  const def = asset.materials[index]!;
  const tinted = def.tintRef !== undefined;
  const key = `${index}|${tinted ? hex : ""}`;
  let m = byKey.get(key);
  if (!m) {
    const tex = texturesOf(asset);
    const map = def.map !== undefined ? tex[def.map] : undefined;
    const normalMap = def.normalMap !== undefined ? tex[def.normalMap] : undefined;
    if (map) map.colorSpace = SRGBColorSpace;
    if (normalMap) normalMap.colorSpace = NoColorSpace;
    m = new MeshStandardMaterial({
      name: def.name,
      map,
      normalMap,
      roughness: def.roughness,
      metalness: 0,
      color: tinted ? tintFor(hex, def.tintRef) : new Color("#ffffff"),
    });
    byKey.set(key, m);
  }
  return m;
}
