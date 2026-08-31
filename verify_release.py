from pathlib import Path
import json,sys
root=Path(__file__).parent
required=['app.js','index.html','styles.css','config.js','manifest.json','sw.js','icon.png','FEATURES.md','README.md','FEATURE_INVENTORY.md','CHANGELOG.md','RELEASE_CHECKLIST.md']
tokens=['addPointToPointWaypoint','distanceMin','renderAdventureWaypointFields','previewRoute3D','undoRouteEdit','saveRouteByIndex','loadSavedRoute','exportSelectedRouteGpx','startLiveJourney','toggleLiveSharingPause','watchSharedJourney','navigationRouteStyle','showNavigationAlternatives','toggleAudioNavigation','unlockAudioNavigation','updateTravelHeading','checkWrongDirection','toggleRecordingPause','toggleNavigationPause','useSavedActivityRoute','showMapLocationMenu','openMapShareMenu','requestScreenWakeLock','attachActivityPhotos','activityPngBlob','estimatePower','refreshWindGrid','analyseAdventureLoop','dedupeAdventureCandidates','buildAdventureAnchors','importGpxFile','data-preview-route','fetchWindAtLocation','fetchHourlyForecast','toggleCycleLayer','fetchCycleInfrastructureScore','plotSignedWind','createChoiceModal']
errors=[f'Missing {x}' for x in required if not (root/x).exists()]
try:json.loads((root/'manifest.json').read_text())
except Exception as e:errors.append(f'Manifest: {e}')
s=(root/'app.js').read_text() if (root/'app.js').exists() else ''
errors += [f'Missing feature token {x}' for x in tokens if x not in s]
if errors:
 print('FAILED');print('\n'.join(errors));sys.exit(1)
print(f'PASSED: {len(required)} files, {len(tokens)} feature tokens')
