# Media Packs

F1 Manager Sim uses local **media packs** for presentation assets. Media is not simulation authority and must remain separate from the immutable Historical World Database and evolving Save World.

The design deliberately borrows the useful idea from TEW-style picture packs: a database/save references stable entity identities while the selected media pack resolves those identities to local image files.

## Principles

- Stable entity IDs are the lookup key. Renaming a driver/team does not break its image.
- A career can switch media packs without changing simulation state.
- Missing images never block a career; category-specific defaults are used.
- Images are presentation-only. They never determine ratings, identity, availability or simulation behaviour.
- The repository must not silently redistribute copyrighted imagery. Each distributable asset should have source/license/provenance metadata where applicable.
- User/mod media packs may contain their own assets without modifying the historical database.

## Proposed pack layout

```text
media-packs/
  default/
    manifest.json
    people/
      drivers/
      staff/
      managers/
    teams/
      logos/
      cars/
      backdrops/
    circuits/
      photos/
      maps/
    cities/
    countries/
      flags/
    sponsors/
    engines/
    tyres/
    championships/
    defaults/
```

The physical filename should normally use the canonical stable ID rather than a display name, for example:

```text
people/drivers/d_0001.webp
people/staff/s_0042.webp
teams/logos/t_0007.webp
circuits/maps/tr_0012.webp
sponsors/sp_0020.webp
```

A manifest may override filenames or provide aliases when an external pack uses another naming convention.

## Image sizes

The resolver must not require one exact source resolution. The UI is responsible for sizing/cropping.

Recommended source sizes:

| Category | Minimum compatible | Recommended | Shape |
| --- | ---: | ---: | --- |
| Driver / staff / manager portrait | 150x150 | 256x256 or 300x300 | square |
| Team logo | 150x150 | 256x256 or larger | square / transparent |
| Sponsor logo | 200x100 | 512x256 | wide, transparent preferred |
| Circuit map | 500x300 | 1024x614 or larger | landscape / transparent preferred |
| Circuit / city photo | 640x360 | 1280x720 | landscape |
| Car image | 600x300 | 1200x600 | landscape / transparent preferred |
| Country flag | 64x40 | 128x80 | landscape |

A TEW-style 150x150 people pack therefore remains valid, while higher-resolution packs can look sharper on modern displays.

Supported runtime formats should include at least `webp`, `png`, `jpg` and `jpeg`. Resolution order may prefer WebP/PNG before JPEG when multiple files exist.

## Lookup and fallback

For an entity `d_0001`, the resolver should:

1. check a manifest override;
2. check the canonical category path by stable ID and supported extensions;
3. optionally check configured aliases;
4. use the selected pack's category default;
5. use the built-in application fallback.

Example:

```text
people/drivers/d_0001.webp
people/drivers/d_0001.png
people/drivers/d_0001.jpg
defaults/driver.webp
```

Generated drivers do not need Historical Database media rows. They can use a generated-person fallback or Save World-created portrait reference later.

## Pack manifest

Each pack contains a small `manifest.json` describing the pack rather than embedding image paths throughout the databases.

Suggested fields:

```json
{
  "format": "f1-manager-sim-media-pack",
  "schemaVersion": 1,
  "id": "default",
  "name": "Default Media Pack",
  "version": "0.1.0",
  "assetRoot": ".",
  "preferredPortraitSize": 256,
  "supportedExtensions": ["webp", "png", "jpg", "jpeg"],
  "defaults": {
    "driver": "defaults/driver.webp",
    "staff": "defaults/staff.webp",
    "teamLogo": "defaults/team-logo.webp",
    "circuit": "defaults/circuit.webp",
    "sponsor": "defaults/sponsor.webp"
  },
  "overrides": {}
}
```

## Database relationship

The Global/Season Database should not carry absolute filesystem paths. At most it may contain a presentation hint such as `media_key`, but canonical entity ID lookup is preferred.

Example:

```text
driver_id = d_0001
media resolver -> people/drivers/d_0001.webp
```

This preserves the architectural boundary:

`Historical/Save World identity -> Media Resolver -> Selected Media Pack -> UI`

## Playtest server

The local playtest server should eventually support a selected pack, for example:

```text
npm run playtest -- <season-db> --global-world <global-db> --media-pack ./media-packs/my-pack
```

The server can expose resolved files under a safe read-only route such as `/media/...`. The media root must be path-contained so arbitrary local files cannot be served.

## Profiles and UI

The same resolver should be used everywhere. A driver portrait shown on Career Home, Drivers, qualifying, race timing or the full profile must resolve from the same entity ID.

Clickable entity profiles can therefore display:

- portrait or logo;
- identity/current team;
- current Save World status;
- attributes/knowledge appropriate to the viewer;
- career/history information;
- relationships/contracts where permitted;
- contextual images such as team logo or circuit map.

No UI component should hardcode its own independent image filename rules.
