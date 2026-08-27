#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
required_files = [
    'index.html', 'app.js', 'styles.css', 'config.js', 'manifest.json',
    'sw.js', 'icon.png', 'README.md', 'FEATURES.md',
    'FEATURE_INVENTORY.md', 'CHANGELOG.md', 'RELEASE_CHECKLIST.md'
]
feature_tokens = {
    'point-to-point waypoint support': ['addPointToPointWaypoint', 'renderWaypointFields'],
    'map route selection': ['bindMapRouteSelection', 'selectRouteFromMap'],
    '3D and Google preview': ['previewRoute3D', 'openGoogleMapsPreview'],
    'saved routes': ['saveSelectedRoute', 'loadSavedRoute'],
    'route sharing': ['shareSelectedRoute', 'shared_routes_v4'],
    'GPX export': ['exportSelectedRouteGpx'],
    'live journeys': ['startLiveJourney', 'updateLiveJourney', 'journeys_v4'],
    'navigation': ['startNavigation', 'updateNavigationGuidance'],
    'voice guidance': ['SpeechSynthesisUtterance', 'voiceGuidance'],
    'rerouting': ['checkRouteDeviation', 'recalculateFrom'],
    'wake lock': ['requestScreenWakeLock', "wakeLock.request('screen')"],
    'activity photos': ['attachActivityPhotos', 'addPhotosToSavedActivity'],
    'activity analysis': ['renderActivityDetail', 'activityPower'],
    'activity sharing': ['shareSavedActivity', 'activityPngBlob'],
    'profile and power': ['profileWeight', 'estimatePower'],
    'weather and spatial wind': ['refreshWindGrid', 'windAtScreen'],
    'authentication': ['signInWithPopup', 'signInWithEmailAndPassword'],
}

errors = []
for name in required_files:
    if not (ROOT / name).exists():
        errors.append(f'Missing required file: {name}')

try:
    json.loads((ROOT / 'manifest.json').read_text())
except Exception as exc:
    errors.append(f'Invalid manifest.json: {exc}')

app = (ROOT / 'app.js').read_text() if (ROOT / 'app.js').exists() else ''
for feature, tokens in feature_tokens.items():
    missing = [token for token in tokens if token not in app]
    if missing:
        errors.append(f'{feature}: missing {missing}')

inventory = (ROOT / 'FEATURE_INVENTORY.md').read_text() if (ROOT / 'FEATURE_INVENTORY.md').exists() else ''
changelog = (ROOT / 'CHANGELOG.md').read_text() if (ROOT / 'CHANGELOG.md').exists() else ''
sw = (ROOT / 'sw.js').read_text() if (ROOT / 'sw.js').exists() else ''
versions = {
    'inventory': re.search(r'Build:\*\*\s*(v[0-9.]+)', inventory),
    'changelog': re.search(r'##\s+(v[0-9.]+)', changelog),
    'service worker': re.search(r'handry-(v[0-9-]+)', sw),
}
if not versions['inventory'] or not versions['changelog']:
    errors.append('Could not determine inventory or changelog version')
elif versions['inventory'].group(1) != versions['changelog'].group(1):
    errors.append('Inventory and changelog version do not match')

if errors:
    print('RELEASE VERIFICATION FAILED')
    for error in errors:
        print(f' - {error}')
    sys.exit(1)

print('RELEASE VERIFICATION PASSED')
print(f'Checked {len(required_files)} required files and {len(feature_tokens)} feature groups.')
