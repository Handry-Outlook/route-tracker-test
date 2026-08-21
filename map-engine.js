import { MAPBOX_TOKEN, X_WEATHER_ID, X_WEATHER_SECRET } from './config.js';

// --- MODULE STATE ---
let aerisController = null;
let isWeatherEnabled = false;

/**
 * Initializes or re-initializes the AerisWeather controller.
 * This is needed on initial map load and after any style change.
 * @param {mapboxgl.Map} map The map instance.
 */
const initializeAerisController = (map) => {
    aerisController = null; // Discard old controller

    if (window.aerisweather) {
        console.log("Initializing AerisWeather SDK...");
        const { Account, MapboxMapController } = window.aerisweather.mapsgl;
        const account = new Account(X_WEATHER_ID, X_WEATHER_SECRET);
        const controller = new MapboxMapController(map, { account });

        controller.on('error', (e) => console.error("❌ AerisWeather Controller Error:", e));
        controller.on('load', () => onAerisControllerReady(map, controller));
    } else {
        console.error("AerisWeather SDK not loaded.");
    }
};

/**
 * Initializes the Mapbox instance
 */
export const initMap = (containerId) => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
        container: containerId,
        // Using navigation-night for a more "pro" routing look
        style: 'mapbox://styles/mapbox/navigation-night-v1',
        center: [-0.1276, 51.5072], // London
        zoom: 12,
        preserveDrawingBuffer: true // Required for generating route images
    });

    map.on('load', () => {
        map.resize();
        if (!map.getSource('mapbox-dem')) {
            map.addSource('mapbox-dem', {
                'type': 'raster-dem',
                'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                'tileSize': 512,
                'maxzoom': 14
            });
        }
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 0 });

        // FIX: Initialize AerisWeather controller immediately on load
        initializeAerisController(map);
    });

    return map;
};

/**
 * Callback for when the Aeris controller is loaded and ready.
 * @param {mapboxgl.Map} map The map instance.
 * @param {any} controller The new aerisweather controller instance.
 */
const onAerisControllerReady = (map, controller) => {
    console.log("✅ AerisWeather Controller is ready.");
    aerisController = controller;

    

    if (isWeatherEnabled) {
        console.log("Adding wind layers now that controller is ready...");
        try {
            aerisController.addWeatherLayer('wind-speeds', { paint: { 'raster-opacity': 0.5 } });
            aerisController.addWeatherLayer('wind-particles');
        } catch (e) {
            console.warn("Weather layers already exist or failed to add:", e);
        }
    }
};

/**
 * Toggles 3D Terrain
 */
export const toggleTerrain = (map, enable) => {
    // After a style change, the DEM source is removed. We must ensure it exists before setting terrain.
    if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
            'type': 'raster-dem',
            'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
            'tileSize': 512,
            'maxzoom': 14
        });
    }
    // Toggle between 0 (Flat but data loaded) and 1.5 (3D)
    // We keep the source attached so elevation queries always work
    map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': enable ? 1.5 : 0 });
};

// Internal state to track markers for cleanup
let markers = [];

/**
 * Adds markers for all waypoints (Start=Green, End=Red, Intermediate=Blue)
 */
export const addRouteMarkers = (map, waypoints, onDragEnd) => {
    // 1. Remove existing markers
    markers.forEach(m => m.remove());
    markers = [];

    if (!waypoints || waypoints.length === 0) return;

    // 2. Helper to handle both "lng,lat" string or [lng, lat] array
    const parse = (c) => (typeof c === 'string' ? c.split(',').map(Number) : c);

    waypoints.forEach((pt, i) => {
        let color = '#3887be'; // Default intermediate (blue)
        if (i === 0) color = '#2ecc71'; // Start (green)
        else if (i === waypoints.length - 1) color = '#e74c3c'; // End (red)

        const marker = new mapboxgl.Marker({ color, draggable: true })
            .setLngLat(parse(pt))
            .addTo(map);

        if (onDragEnd) {
            marker.on('dragend', () => onDragEnd(i, marker.getLngLat().toArray()));
        }

        markers.push(marker);
    });
};

/**
 * Fetches route alternatives from Mapbox API
 * Returns an array of route objects (does not draw them)
 */
export const fetchRouteAlternatives = async (coordinates, options = {}) => {
    try {
        // Safety check for invalid coordinates
        if (!coordinates || coordinates.length < 2 || coordinates.some(c => !c)) return null;

        // Convert array of coordinates to "lng,lat;lng,lat" string for Mapbox API
        const coordString = coordinates.map(c => c.join(',')).join(';');

        // Base URL
        let baseUrl = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordString}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}`;

        if (options.bearings) {
            baseUrl += `&bearings=${options.bearings}`;
        }

        // Strategy: Fetch standard alternatives + variations to maximize options
        // 1. Standard (alternatives=true)
        // 2. Exclude Ferries (often forces a bridge/tunnel route)
        // 3. Exclude Tolls (rare for bikes, but can trigger different paths)
        const queries = [
            `${baseUrl}&alternatives=true`,
            `${baseUrl}&exclude=ferry`,
            `${baseUrl}&exclude=toll`
        ];

        // STRATEGY: "Jitter" Points to force more alternatives
        // If simple Start -> End route, we calculate offset midpoints to force the router
        // to look at paths to the left and right of the direct line.
        if (coordinates.length === 2) {
            const start = coordinates[0];
            const end = coordinates[1];
            const dist = turf.distance(start, end); // km

            // Only jitter if route is substantial (> 2km)
            if (dist > 2) {
                const mid = turf.midpoint(start, end);
                const bearing = turf.bearing(start, end);
                const offset = Math.min(dist * 0.2, 15); // 20% offset, max 15km

                const p1 = turf.destination(mid, offset, bearing + 90);
                const p2 = turf.destination(mid, offset, bearing - 90);

                // Add forced-waypoint queries (we disable alternatives=true for these to save processing)
                const jitterUrl = (pt) => `https://api.mapbox.com/directions/v5/mapbox/cycling/${start.join(',')};${pt.geometry.coordinates.join(',')};${end.join(',')}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}`;
                
                queries.push(jitterUrl(p1));
                queries.push(jitterUrl(p2));
            }
        }

        // Add timeout to prevent hanging on poor mobile connections
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        // Execute requests in parallel
        const responses = await Promise.all(queries.map(url => 
            fetch(url, { signal: controller.signal })
                .then(r => r.ok ? r.json() : null)
                .catch(e => null) // Ignore individual failures
        ));
        
        clearTimeout(timeoutId);

        let allRoutes = [];
        responses.forEach(json => {
            if (json && json.routes) {
                allRoutes.push(...json.routes);
            }
        });

        if (allRoutes.length === 0) {
            throw new Error("No route found");
        }

        // Deduplicate routes based on distance/duration signature
        const uniqueRoutes = [];
        const seenSignatures = new Set();

        allRoutes.forEach(r => {
            // Signature: Distance (rounded to 50m) + Duration (rounded to 30s)
            const sig = `${Math.round(r.distance / 50)}_${Math.round(r.duration / 30)}`;
            if (!seenSignatures.has(sig)) {
                seenSignatures.add(sig);
                uniqueRoutes.push(r);
            }
        });

        return uniqueRoutes;

    } catch (error) {
        console.error("Routing Error:", error);

        let alertMessage = "Failed to calculate route – check your internet connection and try again.";

        if (error.message === "No route found") {
            alertMessage = "No cycling route found between these points. Try closer locations or ensure they’re connected by roads/bike paths.";
        } else if (error.name === "AbortError") {
            alertMessage = "Route calculation timed out – your connection may be slow. Try again.";
        }

        alert(alertMessage);
        return [];
    }
};

export const drawStaticRoute = (map, geoJSON, fitToView = true) => {
    if (map.getSource('route')) {
        map.removeLayer('route-line');
        if (map.getLayer('route-line-casing')) map.removeLayer('route-line-casing');
        map.removeSource('route');
    }

    map.addSource('route', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': geoJSON
        }
    });

    // 1. Add Casing Layer
    map.addLayer({
        'id': 'route-line-casing',
        'type': 'line',
        'source': 'route',
        'layout': { 'line-join': 'round', 'line-cap': 'round' },
        'paint': {
            'line-color': '#ffffff',
            'line-width': 10
        }
    });

    map.addLayer({
        'id': 'route-line',
        'type': 'line',
        'source': 'route',
        'layout': { 'line-join': 'round', 'line-cap': 'round' },
        'paint': {
            'line-color': '#0096ff', // Consistent bright blue
            'line-width': 6,
            'line-opacity': 0.8
        }
    });

    // Zoom to the saved route
    if (fitToView) {
        const bounds = new mapboxgl.LngLatBounds(geoJSON.coordinates[0], geoJSON.coordinates[0]);
        geoJSON.coordinates.forEach(c => bounds.extend(c));
        map.fitBounds(bounds, { padding: 50 });
    }
};

/**
 * Clears the route and markers from the map
 */
export const clearRoute = (map) => {
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getLayer('route-line-casing')) map.removeLayer('route-line-casing');
    if (map.getSource('route')) map.removeSource('route');
    markers.forEach(m => m.remove());
    markers = [];
};

/**
 * Generates elevation profile data for a route geometry
 * @param {mapboxgl.Map} map The map instance (for queryTerrainElevation)
 * @param {Object} geometry GeoJSON LineString geometry from the route
 * @returns {Array} Array of {distance (km), elevation (m), coord}
 */
export const getElevationProfile = async (map, geometry) => {
    if (!geometry || geometry.type !== 'LineString' || geometry.coordinates.length < 2) {
        return [];
    }

    const previousTerrain = map.getTerrain();
    let terrainWasChanged = false;

    // FIX: queryTerrainElevation returns 0 if exaggeration is 0. We must temporarily
    // enable it and, crucially, wait for the map to be 'idle' before querying.
    if (!previousTerrain || previousTerrain.exaggeration === 0) {
        terrainWasChanged = true;
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1 });
        // Wait for the map to finish loading the new terrain before querying.
        await new Promise(resolve => map.once('idle', resolve));
    }

    const coords = geometry.coordinates;
    const profile = [];
    let totalDistance = 0; // meters
    let lastElevation = null;

    const R = 6371000; // Earth radius in meters

    for (let i = 0; i < coords.length; i++) {
        const [lng, lat] = coords[i];

        let elevation = map.queryTerrainElevation([lng, lat]);
        // If terrain is still loading in some edge cases, fall back to last known elevation
        if (elevation == null) {
            elevation = lastElevation ?? 0;
        } else {
            lastElevation = elevation;
        }

        if (i > 0) {
            const [prevLng, prevLat] = coords[i - 1];
            const dLat = (lat - prevLat) * Math.PI / 180;
            const dLon = (lng - prevLng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                      Math.cos(prevLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                      Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            totalDistance += R * c;
        }

        profile.push({
            distance: Math.round(totalDistance / 1000 * 10) / 10, // km, 1 decimal
            elevation: Math.round(elevation),
            coord: [lng, lat]
        });
    }

    // Restore terrain state if we changed it
    if (terrainWasChanged) {
        if (previousTerrain) {
            map.setTerrain(previousTerrain);
        } else {
            map.setTerrain(null);
        }
    }

    return profile;
};

// --- Animation State ---
let animationFrameId;
let animationMarker;
let activeAnimationSpeed = 1;
let isPaused = false;
let animationProgress = 0;

/**
 * Stops any active route animation
 */
export const stopRouteAnimation = () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (animationMarker) {
        animationMarker.remove();
        animationMarker = null;
    }
    isPaused = false;
    animationProgress = 0;
};

/**
 * Toggles pause state
 */
export const togglePause = () => {
    isPaused = !isPaused;
    return isPaused;
};

/**
 * Updates the speed of the active animation
 */
export const setAnimationSpeed = (speed) => {
    activeAnimationSpeed = speed;
};

/**
 * Animates a marker along the route path
 */
export const playRouteAnimation = (map, coordinates, baseDuration = 15000, initialSpeed = 1, onUpdate = null) => {
    stopRouteAnimation(); // Clear existing
    if (!coordinates || coordinates.length < 2) return;

    // Create a distinct marker for animation
    const el = document.createElement('div');
    el.className = 'animation-marker'; // We will style this in CSS
    animationMarker = new mapboxgl.Marker(el).setLngLat(coordinates[0]).addTo(map);

    const line = turf.lineString(coordinates);
    const pathLength = turf.length(line);
    activeAnimationSpeed = initialSpeed;
    isPaused = false;
    animationProgress = 0;

    // 1. Fly to start first
    map.flyTo({ center: coordinates[0], zoom: 18, pitch: 50 });

    // 2. Wait for flyTo to finish, then start animation
    map.once('moveend', () => {
        let lastTime = performance.now();

        const animate = (timestamp) => {
            if (isPaused) {
                lastTime = timestamp; // Reset delta tracking while paused
                animationFrameId = requestAnimationFrame(animate);
                return;
            }

            const dt = timestamp - lastTime;
            lastTime = timestamp;

            // Increment progress based on time delta and current speed
            animationProgress += (dt / baseDuration) * activeAnimationSpeed;
            if (animationProgress > 1) animationProgress = 1;

            const point = turf.along(line, animationProgress * pathLength);

            // Safety check to prevent terrain errors with invalid coords
            if (point && point.geometry && point.geometry.coordinates) {
                const [lng, lat] = point.geometry.coordinates;
                // Strict check to ensure coordinates are valid numbers before passing to Mapbox
                if (Number.isFinite(lng) && Number.isFinite(lat)) {
                    animationMarker.setLngLat([lng, lat]);
                    try {
                        map.jumpTo({ center: [lng, lat] }); // Follow marker
                    } catch (e) {
                        // Ignore transient camera errors to prevent app crash
                    }
                }
            }

            if (onUpdate) onUpdate(animationProgress);

            if (animationProgress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            }
        };
        animationFrameId = requestAnimationFrame(animate);
    });
};

/**
 * Toggles a live traffic layer on the map
 */
export const toggleTraffic = (map) => {
    // Fix: Check if the layer exists, not just the source.
    // Sources can exist without layers if the style was updated or layers were removed.
    if (!map.getLayer('traffic-low')) {
        // Add Traffic Source if it doesn't exist
        if (!map.getSource('mapbox-traffic')) {
            map.addSource('mapbox-traffic', {
                type: 'vector',
                url: 'mapbox://mapbox.mapbox-traffic-v1'
            });
        }

        // Add Layers for different congestion levels
        const layers = [
            { id: 'traffic-low', color: '#2ecc71', congestion: 'low' },
            { id: 'traffic-moderate', color: '#f1c40f', congestion: 'moderate' },
            { id: 'traffic-heavy', color: '#e67e22', congestion: 'heavy' },
            { id: 'traffic-severe', color: '#e74c3c', congestion: 'severe' }
        ];

        layers.forEach(layer => {
            if (!map.getLayer(layer.id)) {
                map.addLayer({
                    'id': layer.id,
                    'type': 'line',
                    'source': 'mapbox-traffic',
                    'source-layer': 'traffic',
                    'filter': ['==', 'congestion', layer.congestion],
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-width': 2, 'line-color': layer.color }
                });
            }
        });
    } else {
        // Toggle Visibility
        const visibility = map.getLayoutProperty('traffic-low', 'visibility');
        const next = (visibility === 'none') ? 'visible' : 'none';
        ['traffic-low', 'traffic-moderate', 'traffic-heavy', 'traffic-severe'].forEach(id => {
            if (map.getLayer(id)) {
                map.setLayoutProperty(id, 'visibility', next);
            }
        });
    }
};

/**
 * Toggles a weather radar layer (RainViewer)
 */
export const toggleWeather = (map, forceVisible = null) => {
    const setVisibility = (layerId, visible) => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
    };

    // Determine target state
    let targetState = 'visible';
    if (forceVisible !== null) {
        targetState = forceVisible ? 'visible' : 'none';
    } else {
        // Toggle based on current state
        targetState = isWeatherEnabled ? 'none' : 'visible';
    }

    isWeatherEnabled = (targetState === 'visible');

    // 1. Met Office Radar
    setVisibility('met-office-radar', isWeatherEnabled);

    // 2. X Weather Wind Particles (MapsGL SDK)
    if (aerisController) {
        if (isWeatherEnabled) {

            aerisController.addWeatherLayer('wind-particles');
        } else {

            aerisController.removeWeatherLayer('wind-particles');
        }
    } else if (isWeatherEnabled) {
        if (!window.aerisweather) console.error("❌ AerisWeather SDK not found on window object.");
        else console.log("⏳ Weather enabled, waiting for AerisWeather controller to load...");
    }
};

/**
 * Restores weather layers after a map style change
 */
export const restoreWeather = (map) => {
    // The AerisWeather controller is invalidated by a style change and must be re-initialized.
    initializeAerisController(map);

    // Note: Met Office radar (raster source) is also wiped by style change.
    // It will reappear on the next animation frame update or needs manual re-adding here if static.
    if (isWeatherEnabled && window.lastRadarBlobUrl) {
        updateMetOfficeLayer(map, window.lastRadarBlobUrl, [-25, 44.02, 16, 64]);
    }
};

// Inside map-engine.js
export const updateMetOfficeLayer = (map, blobUrl, bbox) => {
    const sourceId = 'met-office-source';

    // Ensure coordinates are in the 4-corner array format Mapbox expects
    const coordinates = [
        [bbox[0], bbox[3]], // Top-Left
        [bbox[2], bbox[3]], // Top-Right
        [bbox[2], bbox[1]], // Bottom-Right
        [bbox[0], bbox[1]]  // Bottom-Left
    ];

    const source = map.getSource(sourceId);

    if (!source) {
        map.addSource(sourceId, {
            type: 'image',
            url: blobUrl,
            coordinates: coordinates
        });

        // Insert below labels
        const firstSymbolId = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
        map.addLayer({
            id: 'met-office-radar',
            type: 'raster',
            source: sourceId,
            paint: { 'raster-opacity': 0.6, 'raster-fade-duration': 0 }
        }, firstSymbolId);
    } else {
        // This is the critical part: 
        // Mapbox will now load the "blob:" URL instantly from your RAM
        source.updateImage({
            url: blobUrl,
            coordinates: coordinates
        });
    }
};  // It will reappear on the next animation frame update or needs manual re-adding here if static.
