# Media Packs

F1 Manager Sim uses local **media packs** for presentation assets. Media is not simulation authority and remains separate from both the immutable Historical World Database and the evolving Save World.

The useful design principle is the same as a classic picture-pack system: databases and saves keep stable entity identities while the selected media pack resolves those identities to local presentation files.

## Principles

- Stable entity IDs are the lookup key. Renaming or rebranding an entity does not break its media.
- A career can switch media packs without changing simulation state.
- Missing images never block a career.
- Media never determines ratings, identity, availability, performance or simulation behaviour.
- The repository must not silently redistribute copyrighted imagery. Historical/distributable assets need appropriate source, licence and provenance handling.
- User/mod packs may provide their own assets without changing historical data or saves.
- Filesystem paths stay inside the server-side resolver. Browser/API projections receive URLs, not absolute operating-system paths.

## Runtime status

The developer playtest has a runtime Media Pack resolver in `src/media/mediaPack.js`.

The playtest server selects the bundled default pack unless another pack is passed explicitly:

```text
npm run playtest -- <season-db> --global-world <global-db> --media-pack ./media-packs/my-pack
```

A user-selected pack must contain a valid `manifest.json`. The bundled default pack is intentionally allowed to contain no historical images yet: unresolved entities fall back to application-generated SVG placeholders.

The server exposes presentation-only endpoints:

```text
GET /api/media-pack
GET /api/media/resolve?kind=driver&id=d_0001
GET /media/assets/<safe-relative-path>
GET /media/fallback/<kind>.svg
```

`/media/assets/` is read-only and path-contained. Absolute paths, traversal outside the selected pack, symbolic-link escapes and unsupported file types are rejected.

## Pack layout

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

The physical filename should normally use the canonical stable ID rather than a display name:

```text
people/drivers/d_0001.webp
people/staff/s_0042.webp
teams/logos/t_0007.webp
teams/cars/t_0007.webp
circuits/maps/tr_0012.webp
sponsors/sp_0020.webp
```

## Supported media kinds

The resolver currently understands these categories:

```text
driver
staff
manager
teamLogo
car
teamBackdrop
circuit
circuitMap
city
flag
sponsor
engine
tyre
championship
```

This category list is presentation infrastructure. Adding an image category does not add any game mechanic or simulation authority.

## Image sizes

The resolver does not require one exact source resolution. UI components are responsible for sizing and cropping.

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

A 150x150 people pack therefore remains valid while higher-resolution packs can look sharper on modern displays.

User-provided runtime assets are deliberately limited to `webp`, `png`, `jpg` and `jpeg`. Arbitrary SVG from external packs is not served because SVG can contain active content. The application may still use its own fixed, generated SVG for built-in missing-media fallbacks.

## Lookup and fallback

For an entity such as `d_0001`, resolution is deterministic:

1. manifest override;
2. canonical category path by stable ID, following the manifest extension order;
3. selected pack category default, if that file actually exists;
4. built-in application SVG fallback.

Example canonical search:

```text
people/drivers/d_0001.webp
people/drivers/d_0001.png
people/drivers/d_0001.jpg
```

A missing path written in a manifest is not treated as an asset. Resolution continues safely to the next fallback.

Generated drivers do not need Historical Database media rows. They can use the same fallback system now and a Save World-created portrait reference in a future generated-media layer.

## Manifest

Every selected external pack contains `manifest.json`.

Example:

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
    "car": "defaults/car.webp",
    "circuit": "defaults/circuit.webp",
    "circuitMap": "defaults/circuit-map.webp"
  },
  "overrides": {
    "driver": {
      "d_0001": "custom/drivers/d_0001-special.webp"
    }
  }
}
```

Overrides may also use the flat `kind:entityId` form. All manifest paths are validated as paths relative to the pack.

## Database and Save World relationship

The Global/Season Database must not carry absolute filesystem paths. At most it may contain presentation hints such as team colours or template keys with explicit provenance; canonical stable-ID lookup is preferred for media files.

Example:

```text
driver_id = d_0001
media resolver -> people/drivers/d_0001.webp
```

The architecture remains:

```text
Historical/Save World identity
          ↓
Presentation projection
          ↓
Media resolver
          ↓
Selected Media Pack
          ↓
UI
```

Changing the final two layers cannot change the simulated world.

## Profiles and UI

Entity profiles now consume resolver output rather than inventing independent image paths. Driver/staff profiles can show the resolved portrait; team profiles can show the resolved logo and car slot.

The same resolver should progressively be reused by Career Home, Drivers, Staff, qualifying, race timing, championship pages, F1 World and the future circuit/race-map renderer.

No UI component should create its own media naming convention.

## Tests

`tests/mediaPack.test.js` validates:

- no-pack fallback;
- stable-ID canonical lookup;
- manifest override precedence;
- category default fallback;
- malformed manifests;
- absolute/traversal path rejection;
- symbolic-link escape rejection;
- external SVG rejection;
- safe served-path containment and file-type filtering.

The Media Pack tests run inside the same full `npm test` gate as simulation and long-run validation. Presentation infrastructure therefore cannot bypass core regression testing.
