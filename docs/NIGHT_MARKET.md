# Night market: two floors and courtyard skywalk

The night market combines the two-level street and elevated courtyard skywalk branches. Main's in-game settings, graphics preferences and other scenes remain in place.

- The east stair connects the ground street to the tea gallery, dessert balcony and courtyard loop at a foot height of 5.4. The west street remains an independent ground-floor underpass.
- The two blocked central plots are raised lotus and bamboo gardens. Their visible borders stay inside the non-walkable plots, leaving the surrounding lanes open.
- Upper decks and shop platforms share one rectangle union. Boards, outer rails and corner posts are generated once, with openings for the stair and shop counters. Stair treads have separate footprints; structural piers avoid ground lanes and shop eaves.
- The sweets shop is spaced away from the noodle house, and the west pine is outside the walking lane.
- The unreachable background uses procedural tiled-roof town houses, warm windows, boundary walls, a distant tower, rounded hills and a moon. It matches the existing clay palette and requires no external world-generation service or new downloaded assets. Flowers and pines reuse the existing model library.

All new scenery, sky, fog and moon are mounted inside `NightMarketScene`. There is no star field or ambient particle layer. Shared environment components and other scene backgrounds are unchanged. Height-aware movement is enabled only when a scene supplies `groundHeight`; ordinary scenes retain their existing solid collision and pose format. Night-market replays record foot height while accepting older four-field recordings.

## Verification

Run `npm run check` and `npm run build:pages`. Regression coverage includes all shop routes, buying upstairs, stair ascent/descent, independent underpass traffic, replay heights, deck/tread overlap, rail openings, garden boundaries and unreachable background footprints. First-person tests also verify ordinary movement alongside height-aware night-market movement.

The images below are offline geometry reviews exported from the scene and rendered in Blender. Browser text, textures, postprocessing and lighting differ; these are not gameplay screenshots.

- [Overview](review/nightmarket-fixed-overview.png)
- [Courtyards](review/nightmarket-fixed-courtyard.png)
- [Stair and landing](review/nightmarket-fixed-stairs.png)
