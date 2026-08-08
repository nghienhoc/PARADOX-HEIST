# ASSET CREDITS

## Summary

**As of 2026-08-08, this project contains no third-party assets.**

Every visual in the game is generated procedurally at runtime in
[`src/utils/textures.ts`](src/utils/textures.ts) using Phaser's `Graphics` API and
`generateTexture()`. There are no image, audio, video or font files in the repository,
and nothing is loaded from a remote host at runtime.

Fonts are the browser's own generic families, requested via CSS:
`ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace`. No webfont is
downloaded or bundled.

## Procedurally generated textures

| Texture key | Purpose |
| --- | --- |
| `tex-player` | Player agent silhouette (cyan) |
| `tex-echo` | Echo agent silhouette (spectral violet) |
| `tex-bullet` | Player projectile |
| `tex-bullet-echo` | Echo projectile |
| `tex-particle` | Impact sparks, shards, muzzle flashes |
| `tex-glow` | Soft additive glow for the Time Core and Echo markers |
| `tex-floor-tile` | Tiled vault floor with grid detail |
| `tex-wall` | Wall slab |
| `tex-core` | Time Core (gold) |

## Third-party assets

_None._

When any external asset is added (audio is the most likely first case), add a row here
before merging it, recording:

| Asset | Author | Source | License | Modifications | Path in project |
| --- | --- | --- | --- | --- | --- |

Only these licenses are acceptable: CC0, public domain, MIT, Apache, commercial-use
royalty-free, or attribution licenses **with** the attribution recorded above. Do not
add assets with unclear licensing, assets extracted from commercial games, or
hotlinked/remote-URL assets.

## Development dependencies

The toolchain (Vite, TypeScript, Phaser, Vitest, Playwright) is installed via npm and
declared in `package.json`. Phaser 3 is MIT licensed. These are dependencies, not
bundled creative assets, and are not itemised here.
