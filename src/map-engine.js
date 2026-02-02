import { MAPBOX_TOKEN } from './config.js';

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
        // Add Terrain Source for Elevation Data
        map.addSource('mapbox-dem', {
            'type': 'raster-dem',
            'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
            'tileSize': 512,
            'maxzoom': 14
        });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
    });

    return map;
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
 * Fetches and draws a HIGH-RESOLUTION route
 */
export const drawWindRoute = async (map, coordinates, options = {}) => {
    try {
        // Safety check for invalid coordinates
        if (!coordinates || coordinates.length < 2 || coordinates.some(c => !c)) return null;

        // Convert array of coordinates to "lng,lat;lng,lat" string for Mapbox API
        const coordString = coordinates.map(c => c.join(',')).join(';');

        // PRO TIP: overview=full gives high resolution, steps=true gives turn-by-turn
        let url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordString}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}`;
        
        if (options.avoidHighways) {
            url += '&exclude=motorway';
        }
        
        const query = await fetch(url);
        const json = await query.json();

        if (!json.routes || json.routes.length === 0) {
            throw new Error("No route found");
        }

        const routeData = json.routes[0];
        const routeGeoJSON = routeData.geometry;

        // CLEANUP: If a route already exists, remove it
        if (map.getSource('route')) {
            map.removeLayer('route-line');
            map.removeSource('route');
        }

        // Add the route as a source
        map.addSource('route', {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': routeGeoJSON
            }
        });

        // Draw the line with a "Glow" effect
        map.addLayer({
            'id': 'route-line',
            'type': 'line',
            'source': 'route',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-color': '#3887be',
                'line-width': 6,
                'line-opacity': 0.8
            }
        });

        // "Fly" the map to fit the whole route using the Bounding Box
        const routeCoords = routeGeoJSON.coordinates;
        const bounds = new mapboxgl.LngLatBounds(routeCoords[0], routeCoords[0]);
        
        for (const coord of routeCoords) {
            bounds.extend(coord);
        }

        map.fitBounds(bounds, { 
            padding: 80, // More padding looks more professional
            duration: 2000 // Smooth 2-second flight
        });

        return routeData; 

    } catch (error) {
        console.error("Routing Error:", error);
        alert("Failed to find a cycling route. Try locations on the same continent!");
        return null;
    }
};

export const drawStaticRoute = (map, geoJSON) => {
    if (map.getSource('route')) {
        map.removeLayer('route-line');
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

    map.addLayer({
        'id': 'route-line',
        'type': 'line',
        'source': 'route',
        'layout': { 'line-join': 'round', 'line-cap': 'round' },
        'paint': {
            'line-color': '#f39c12', // Orange color to distinguish from "live" search
            'line-width': 6,
            'line-opacity': 0.8
        }
    });

    // Zoom to the saved route
    const bounds = new mapboxgl.LngLatBounds(geoJSON.coordinates[0], geoJSON.coordinates[0]);
    geoJSON.coordinates.forEach(c => bounds.extend(c));
    map.fitBounds(bounds, { padding: 50 });
};

/**
 * Clears the route and markers from the map
 */
export const clearRoute = (map) => {
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');
    markers.forEach(m => m.remove());
    markers = [];
};

/**
 * Generates an elevation profile from the route coordinates
 * Uses Mapbox Terrain data (client-side)
 */
export const getElevationProfile = (map, coordinates) => {
    const profile = [];
    let totalDistance = 0;
    const R = 6371e3; // Earth radius in meters
    const toRad = x => x * Math.PI / 180;

    // Sample the route to avoid performance hits on long routes
    // We take every nth point based on total length
    const step = Math.max(1, Math.floor(coordinates.length / 100));

    for (let i = 0; i < coordinates.length; i += step) {
        const coord = coordinates[i];
        // Safety check for valid coordinates
        if (!coord || coord.length < 2 || !Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) continue;

        let [lng, lat] = coord;
        // Clamp latitude to safe Web Mercator bounds to prevent terrain tile lookup errors
        lat = Math.max(-85, Math.min(85, lat));

        let elevation = 0;
        try {
            // Explicitly check terrain and use LngLat object for safety
            if (map.getTerrain() && map.getSource('mapbox-dem')) {
                elevation = map.queryTerrainElevation(new mapboxgl.LngLat(lng, lat)) || 0;
            }
        } catch (e) { /* Ignore terrain errors during load */ }

        if (i > 0) {
            const [prevLng, prevLat] = coordinates[i - step] || coordinates[0];
            const dLat = toRad(lat - prevLat);
            const dLon = toRad(lng - prevLng);
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(prevLat)) * Math.cos(toRad(lat)) * Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            totalDistance += R * c;
        }
        profile.push({ distance: totalDistance, elevation, coord: [lng, lat] });
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
export const toggleWeather = (map) => {
    if (map.getLayer('met-office-radar')) {
        const visibility = map.getLayoutProperty('met-office-radar', 'visibility');
        map.setLayoutProperty('met-office-radar', 'visibility', visibility === 'none' ? 'visible' : 'none');
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
};