# Handry Outlook Feature Register

**Build:** v4.8  
**Updated:** 26 August 2026

## New in v4.8
- Wind is now sampled across the complete visible map bounds using a multi-point spatial grid rather than one centre-point direction.
- Particle direction and speed are bilinearly interpolated across the viewport.
- The wind grid refreshes after pan and zoom, with denser geographic coverage when zoomed out.
- Dragging an Adventure turn node now preserves multiple anchors around the loop instead of recalculating as start → dragged point → start.
- Loop edits are rejected when the returned route loses closure, falls below 55% of the previous distance, or collapses most of its enclosed area.
- A rejected loop edit automatically restores the previous route.
- Adventure routing explicitly scores route steps for cycle-route cues including cycleways, NCN references, greenways, trails, towpaths, and shared paths.
- Adventure POI search includes national cycle routes, cycle trails, and greenways.
- Adventure route cards display an approximate cycle-route cue percentage.
- Selected adventure routes expose a dedicated **Navigate adventure route** action.
- A persistent green **Navigation and record now** button appears directly above the mobile bottom bar whenever exactly one route is selected on the map.
- The same quick action is centred above the map controls on desktop.
- Quick navigation opens Explore, starts GPS recording, and follows the selected route.
