# Picrew Tagging Guide

## Goal
Tag each imported asset so the portrait generator can pick pieces by semantics instead of random fallback.

The editable override file is:

- [src/data/picrew2815216TagOverrides.js](/Users/quinn/Documents/Pearly Gates/src/data/picrew2815216TagOverrides.js)

The generated source manifest is:

- [src/data/picrew2815216Pack.js](/Users/quinn/Documents/Pearly Gates/src/data/picrew2815216Pack.js)

Do not hand-edit the generated pack unless you are changing the importer.

## Recommended Workflow
1. Work one slot at a time: `base`, `eyes`, `nose`, `mouth`, `ears`, `hair`, `arms`.
2. For each asset, add 3-6 concrete tags in the override file.
3. Prefer visible, descriptive tags over interpretive story tags.
4. Reuse the same vocabulary across assets so the LLM has a stable tag language.
5. Keep one `default` tag on the original selected parts if you want a recognizable fallback composition.

## Tag Types
Use a mix of these:

- Shape tags: `round`, `long`, `tiny`, `wide`, `pointed`, `narrow`
- Expression tags: `smug`, `sad`, `sleepy`, `angry`, `blank`, `goofy`
- Style tags: `spiky`, `messy`, `smooth`, `chunky`, `radiating`
- Vibe tags: `chaotic`, `sweet`, `grim`, `awkward`, `mischievous`
- Pose tags for arms: `raised`, `reaching`, `shrug`, `crossed`, `dangling`

## Slot Guidance
### `base`
- Focus on silhouette, build, skin/body color, face width, jaw shape.
- Example tags: `round-face`, `long-face`, `soft-jaw`, `broad-head`, `grey-blue`

### `eyes`
- Focus on openness, angle, pupil size, and mood.
- Example tags: `half-lidded`, `wide`, `narrow`, `tired`, `scheming`

### `nose`
- Focus on size and shape.
- Example tags: `button`, `long`, `wide`, `upturned`, `tiny`

### `mouth`
- Focus on expression and curve.
- Example tags: `smile`, `smirk`, `frown`, `flat`, `open-mouth`

### `ears`
- Focus on outline and size.
- Example tags: `round`, `big`, `pointed`, `stubby`, `flared`

### `hair`
- Focus on silhouette and energy.
- Example tags: `spiky`, `radiating`, `flat`, `wild`, `neat`

### `arms`
- Focus on pose and gesture.
- Example tags: `raised`, `waving`, `reaching`, `shrug`, `dangling`

## Good Tagging Rules
- Good: `smirk`, `half-lidded`, `spiky`, `raised`
- Bad: `cool`, `good`, `weird one`, `option 7`

## Suggested Session Plan
1. Tag all `mouth` assets first. Expression tags give the fastest quality win.
2. Tag `eyes` next. That usually gives the second biggest improvement.
3. Tag `hair` and `arms` for stronger silhouette/personality.
4. Finish `base`, `ears`, and `nose`.

## Fast Review Loop
After each slot pass:

1. Save the override file.
2. Run `npm run build`.
3. Generate a few souls in the app and see whether the chosen pieces feel semantically right.
4. Tighten any tags that are too vague or too broad.
