# Weapon model attribution

All four live weapon cores are local, self-contained glTF files by Quaternius, released under CC0. The game adds its own per-weapon accents and cosmetic finishes. The model classes describe game behavior, not the original asset names.

| Game weapon | Local file | Original model | Source |
| --- | --- | --- | --- |
| Pulse rifle | `rifle.gltf` | `Guns/glTF/AR_1.gltf` | [Sci-Fi Modular Gun Pack (2021)](https://quaternius.com/packs/scifimodularguns.html) |
| Ion SMG | `smg.gltf` | `Guns/glTF/SMG_1.gltf` | [Sci-Fi Modular Gun Pack (2021)](https://quaternius.com/packs/scifimodularguns.html) |
| Nova shotgun | `shotgun.gltf` | `Guns/glTF/Shotgun.gltf` | [Toon Shooter Game Kit (2022)](https://quaternius.com/packs/toonshootergamekit.html) |
| Solar Lance | `sniper.gltf` | `Guns/glTF/Sniper_1.gltf` | [Sci-Fi Modular Gun Pack (2021)](https://quaternius.com/packs/scifimodularguns.html) |

Both source pages identify the packs as CC0. The four downloaded glTF files embed their geometry and require no external textures or runtime asset requests. Only these four model files are inside `public/assets/weapons/` for the live game. The earlier 2018 Sci-Fi Gun Pack FBX/GLB sources remain in `assets/legacy-weapons/` for reference and are excluded from the build.
