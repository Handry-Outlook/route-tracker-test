import { auth, googleProvider, saveRouteToCloud, fetchAllRoutes, deleteRouteFromCloud, createLiveSession, updateLiveSession, subscribeToLiveSession } from './firebase.js';
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { fetchWindAtLocation } from './weather-api.js';
import { calculateWindImpact } from './geo-logic.js';
import { initMap, drawWindRoute, drawStaticRoute, addRouteMarkers, clearRoute, getElevationProfile, playRouteAnimation, stopRouteAnimation, toggleTraffic, toggleWeather, setAnimationSpeed, togglePause, updateMetOfficeLayer } from './map-engine.js';
import { MAPBOX_TOKEN } from './config.js';

// --- GLOBAL STATE ---
let currentUser = null;
let currentRouteData = null;
let waypoints = [null, null]; // Array to hold coordinates for multi-stop routes
let geocoders = [];
let userLocation = null;
let watchId = null;
let userMarker = null;
let isNavigating = false;
let elevationMarker = null; // Marker for chart hover
let currentSort = 'date'; // Default sort for saved routes
let speechSynth = window.speechSynthesis;
let lastSpokenStepIndex = -1;
let poiMarkers = []; // Store POI markers
let liveSessionId = null;
let remoteMarker = null;
let metOfficeTimestamps = [];
let lastLogicalWeatherUrl = null;
let lastBlobUrl = null;

const GEO_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 15000, // Wait up to 15s for a GPS lock
    maximumAge: 0   // Force fresh GPS data, do not use cache
};

const map = initMap('map');

document.addEventListener('DOMContentLoaded', () => {
    injectCustomStyles();
    initTheme();
    // --- AUTH ---
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userProfile = document.getElementById('user-profile');

    if (auth) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = { uid: user.uid, name: user.displayName, avatar: user.photoURL };
                userProfile.innerHTML = `<img id="user-avatar" src="${user.photoURL}" alt="User Avatar">`;
                loginBtn.style.display = 'none';
                logoutBtn.style.display = 'block';
                document.getElementById('user-profile').style.display = 'flex';
                loadSavedList();
            } else {
                currentUser = null;
                userProfile.style.display = 'none';
                loginBtn.style.display = 'block';
                logoutBtn.style.display = 'none';
                document.getElementById('saved-routes-list').innerHTML = '<p class="empty-state">Please log in to see your routes.</p>';
            }
        });

        loginBtn.addEventListener('click', () => {
            const originalText = loginBtn.innerHTML;
            loginBtn.innerHTML = 'Wait...';
            loginBtn.disabled = true;
            
            signInWithPopup(auth, googleProvider).catch(e => {
                console.error("Auth Error", e);
                let msg = "Login Failed: " + e.message;
                if (e.code === 'auth/unauthorized-domain') {
                    msg = `Configuration Error: The domain "${window.location.hostname}" is not authorized.\n\nPlease add it to your Firebase Console under Authentication > Settings > Authorized Domains.`;
                } else if (e.code === 'auth/popup-closed-by-user') {
                    msg = "Login cancelled by user.";
                } else if (e.code === 'auth/popup-blocked') {
                    msg = "Login popup was blocked. Please allow popups for this site.";
                }
                alert(msg);
                loginBtn.innerHTML = originalText;
                loginBtn.disabled = false;
            });
        });
        logoutBtn.addEventListener('click', () => signOut(auth));
    } else if (loginBtn) {
        loginBtn.addEventListener('click', () => alert("Authentication system failed to initialize. Check console for details."));
    }

    // --- TABS ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // --- INJECT SHARE TAB ---
    const tabContainer = document.querySelector('.tab-container');
    if (tabContainer) {
        const shareTabBtn = document.createElement('button');
        shareTabBtn.className = 'tab-btn';
        shareTabBtn.dataset.tab = 'share';
        shareTabBtn.innerHTML = 'Share';
        shareTabBtn.addEventListener('click', () => switchTab('share'));
        tabContainer.appendChild(shareTabBtn);

        // Create Content Area
        const directionsTab = document.getElementById('directions-tab');
        const shareTabContent = document.createElement('div');
        shareTabContent.id = 'share-tab';
        shareTabContent.className = 'tab-content';
        shareTabContent.innerHTML = `<div class="empty-state"><p>Plan a route to see sharing options.</p></div>`;
        directionsTab.parentNode.appendChild(shareTabContent);
    }

    // --- ROUTE PLANNING ---
    geocoders.push(createGeocoder('geocoder-start', 'Choose a starting point...', 0));
    geocoders.push(createGeocoder('geocoder-end', 'Choose a destination...', 1));


    // Add Reverse Button
    const reverseBtn = document.createElement('button');
    reverseBtn.className = 'icon-btn reverse-btn';
    reverseBtn.innerHTML = `<i data-feather="refresh-cw"></i>`;
    reverseBtn.title = "Reverse Route";
    reverseBtn.onclick = reverseRoute;
    document.querySelector('.location-input-wrapper').appendChild(reverseBtn);

    document.getElementById('add-destination-btn').addEventListener('click', addDestination);
    document.getElementById('plan-btn').addEventListener('click', calculateRoute);
    document.getElementById('clear-route-btn').addEventListener('click', resetRoutePlanner);

    initRouteOptionsUI();

    // --- EVENT LISTENERS ---
    document.querySelector('.locate-me-btn').addEventListener('click', locateUser);
    document.getElementById('save-btn').addEventListener('click', handleSaveButtonClick);

    // --- MAP CONTROLS STACK ---
    // Create a container for map controls to stack them neatly
    const controlsStack = document.createElement('div');
    controlsStack.className = 'map-controls-stack';
    document.body.appendChild(controlsStack);

    // --- COMPASS ---
    // Added to stack for better mobile organization
    const compassBtn = document.createElement('div');
    compassBtn.id = 'compass-icon';
    compassBtn.innerHTML = `
        <span class="compass-label n">N</span>
        <span class="compass-label s">S</span>
        <span class="compass-label e">E</span>
        <span class="compass-label w">W</span>
        <i data-feather="compass"></i>
    `;
    compassBtn.title = "Reset North";
    controlsStack.appendChild(compassBtn);

    // Sync icon rotation with map bearing
    map.on('rotate', () => {
        const bearing = map.getBearing();
        compassBtn.style.transform = `rotate(${-bearing}deg)`;
    });

    compassBtn.addEventListener('click', () => {
        map.easeTo({ bearing: 0, pitch: 0 });
    });

    // Weather Layer Button
    const weatherBtn = document.createElement('button');
    weatherBtn.className = 'map-overlay-btn';
    weatherBtn.innerHTML = `<i data-feather="cloud-rain"></i>`;
    weatherBtn.title = "Toggle Rain Radar";
    weatherBtn.onclick = () => {
        const isActive = weatherBtn.classList.toggle('active');
        if (isActive) {
            lastLogicalWeatherUrl = null; // Force update so it fetches even if URL hasn't changed
            // Load current radar immediately (Progress 0, Duration 0)
            updateWeatherForProgress(0, 0);
        } else {
            toggleWeather(map); // Hide layer
        }
    };
    controlsStack.appendChild(weatherBtn);

    // Traffic Toggle Button
    const trafficBtn = document.createElement('button');
    trafficBtn.className = 'map-overlay-btn';
    trafficBtn.innerHTML = `<i data-feather="activity"></i>`;
    trafficBtn.title = "Toggle Traffic";
    trafficBtn.onclick = () => {
        toggleTraffic(map);
        trafficBtn.classList.toggle('active');
    };
    controlsStack.appendChild(trafficBtn);

    // Recenter Button (Dynamically Created)
    const recenterBtn = document.createElement('button');
    recenterBtn.id = 'recenter-btn';
    recenterBtn.className = 'map-overlay-btn';
    recenterBtn.innerHTML = `<i data-feather="crosshair"></i>`;
    recenterBtn.title = "Recenter Map";
    recenterBtn.onclick = () => {
        if (userLocation) {
            map.flyTo({ center: userLocation, zoom: 16 });
        } else {
            locateUser(); // Fallback to finding location if not set
        }
    };
    controlsStack.appendChild(recenterBtn);

    // Navigation Button (Dynamically Created)
    const navBtn = document.createElement('button');
    navBtn.id = 'nav-btn';
    navBtn.className = 'map-overlay-btn';
    navBtn.style.display = 'none'; // Hidden until route is selected
    navBtn.innerHTML = `<i data-feather="navigation"></i>`;
    navBtn.title = "Follow User";
    navBtn.onclick = toggleNavigation;
    controlsStack.appendChild(navBtn);

    // Add Theme Toggle to Header
    const header = document.querySelector('.header');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'icon-btn theme-toggle';
    toggleBtn.innerHTML = `<i data-feather="moon"></i>`;
    toggleBtn.onclick = toggleTheme;
    header.appendChild(toggleBtn);
    if (feather) feather.replace();

    // Check URL for Tracking or Route
    const urlParams = new URLSearchParams(window.location.search);
    const trackId = urlParams.get('track');
    if (trackId) {
        initTrackingMode(trackId);
    } else {
        checkUrlForRoute();
    }
});

function initRouteOptionsUI() {
    const container = document.getElementById('destination-list');
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'route-options-container';
    optionsDiv.innerHTML = `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:var(--text-secondary);">
            <input type="checkbox" id="avoid-highways"> Avoid Highways
        </label>
        
        <div class="time-selector">
            <select id="time-mode">
                <option value="depart">Depart At</option>
                <option value="arrive">Arrive By</option>
            </select>
            <input type="datetime-local" id="route-time">
        </div>

        <div class="time-selector">
            <label>Pace:</label>
            <input type="number" id="user-pace" class="pace-input" value="20" min="5" max="50"> km/h
        </div>
    `;
    container.appendChild(optionsDiv);

    // Set default time to now
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('route-time').value = now.toISOString().slice(0, 16);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
}

function createGeocoder(containerId, placeholder, index) {
    const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: placeholder,
        marker: false
    });

    document.getElementById(containerId).appendChild(geocoder.onAdd(map));

    geocoder.on('result', (e) => {
        waypoints[index] = e.result.center;
        addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
    });

    geocoder.on('clear', () => {
        waypoints[index] = null;
    });

    return geocoder;
}

function addDestination() {
    const destinationList = document.getElementById('destination-list');
    const newIndex = waypoints.length;
    waypoints.push(null);

    const wrapper = document.createElement('div');
    wrapper.className = 'location-input-wrapper';
    const container = document.createElement('div');
    container.className = 'geocoder-container';

    wrapper.appendChild(container);
    destinationList.appendChild(wrapper);

    const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: `Choose destination #${newIndex}...`,
        marker: false
    });

    container.appendChild(geocoder.onAdd(map));
    geocoders.push(geocoder);

    geocoder.on('result', (e) => {
        waypoints[newIndex] = e.result.center;
        addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
    });
    geocoder.on('clear', () => { waypoints[newIndex] = null; });
}

async function calculateRoute() {
    const planBtn = document.getElementById('plan-btn');
    const originalContent = planBtn.innerHTML;

    try {
        const validWaypoints = waypoints.filter(w => w);
        if (validWaypoints.length < 2) {
            return alert("Please select at least a start and end point.");
        }

        planBtn.disabled = true;
        planBtn.innerHTML = `<i data-feather="loader" class="spin-anim"></i> Planning...`;
        if (feather) feather.replace();

        const avoidHighways = document.getElementById('avoid-highways')?.checked || false;
        const route = await drawWindRoute(map, validWaypoints, { avoidHighways });
        if (route) {
            switchTab('directions'); // Switch first so chart can render correctly
            handleRouteSelection(route, true);
            document.getElementById('clear-route-btn').style.display = 'block';
        }
    } finally {
        planBtn.disabled = false;
        planBtn.innerHTML = originalContent;
        if (feather) feather.replace();
    }
}

function resetRoutePlanner() {
    waypoints = [null, null];
    geocoders.forEach(g => g.clear());

    const destinationList = document.getElementById('destination-list');
    destinationList.innerHTML = `
        <div class="location-input-wrapper">
            <div id="geocoder-start" class="geocoder-container"></div>
            <button class="icon-btn reverse-btn" title="Reverse Route" onclick="reverseRoute()">
                <i data-feather="refresh-cw"></i>
            </button>
            <button class="icon-btn locate-me-btn" title="Use current location"><i data-feather="crosshair"></i></button>
        </div>
        <div class="location-input-wrapper">
            <div id="geocoder-end" class="geocoder-container"></div>
        </div>
    `;
    geocoders = [];
    geocoders.push(createGeocoder('geocoder-start', 'Choose a starting point...', 0));
    geocoders.push(createGeocoder('geocoder-end', 'Choose a destination...', 1));
    initRouteOptionsUI(); // Re-add options
    document.querySelector('.locate-me-btn').addEventListener('click', locateUser);

    clearRoute(map);
    document.getElementById('clear-route-btn').style.display = 'none';
    const navBtn = document.getElementById('nav-btn');
    if (navBtn) navBtn.style.display = 'none';
    stopRouteAnimation();

    // Remove elevation chart if exists
    const chart = document.getElementById('elevation-container');
    if (chart) chart.remove();

    // Clear POIs
    poiMarkers.forEach(m => m.remove());
    poiMarkers = [];

    document.getElementById('save-btn').style.display = 'none';
    switchTab('plan');
}

function reverseRoute() {
    if (waypoints.length < 2) return;

    // 1. Swap Coordinates
    const tempCoords = waypoints[0];
    waypoints[0] = waypoints[1];
    waypoints[1] = tempCoords;

    // 2. Swap Input Values (Visual)
    const inputStart = geocoders[0]._inputEl;
    const inputEnd = geocoders[1]._inputEl;
    const tempText = inputStart.value;

    // We set values directly to avoid triggering double searches
    inputStart.value = inputEnd.value;
    inputEnd.value = tempText;

    // 3. Recalculate if we have a route
    if (waypoints[0] && waypoints[1]) calculateRoute();
}

async function handleRouteSelection(route, isNew = false) {
    currentRouteData = route;
    document.getElementById('nav-btn').style.display = 'block';
    stopRouteAnimation(); // Stop any previous animation
    if (isNew && currentUser) {
        document.getElementById('save-btn').style.display = 'block';
    }

    // --- POPULATE SHARE TAB ---
    const shareTab = document.getElementById('share-tab');
    if (shareTab) {
        shareTab.innerHTML = `
            <div class="title-container"><h3>Share & Export</h3></div>
            <div class="share-grid">
                <div class="share-card" id="card-share-link">
                    <i data-feather="link"></i>
                    <span>Get Link</span>
                </div>
                <div class="share-card" id="card-snapshot">
                    <i data-feather="camera"></i>
                    <span>Snapshot</span>
                </div>
                <div class="share-card" id="card-gpx">
                    <i data-feather="download"></i>
                    <span>Download GPX</span>
                </div>
                <div class="share-card" id="card-live">
                    <i data-feather="radio"></i>
                    <span>Live Session</span>
                </div>
            </div>
            <div id="share-output-area" style="margin-top:20px;"></div>
        `;
        if (feather) feather.replace();

        // Attach Listeners with Loading State
        document.getElementById('card-share-link').onclick = () => showLinkUI(route);
        
        document.getElementById('card-snapshot').onclick = (e) => 
            withLoading(e.currentTarget, captureRouteSnapshot);
            
        document.getElementById('card-gpx').onclick = (e) => 
            withLoading(e.currentTarget, async () => downloadGPX(route));
            
        document.getElementById('card-live').onclick = (e) => 
            withLoading(e.currentTarget, startLiveSessionUI);
    }

    // Add Realtime Navigation Button (Google Maps Style)
    if (!document.getElementById('realtime-nav-btn')) {
        const navBtn = document.createElement('button');
        navBtn.id = 'realtime-nav-btn';
        navBtn.className = 'primary-btn nav-btn-large';
        navBtn.innerHTML = `<i data-feather="navigation"></i> Start Navigation`;
        navBtn.onclick = toggleNavigation;
        document.getElementById('directions-list').parentNode.insertBefore(navBtn, document.getElementById('directions-list'));
    }

    // --- Update Time Stats ---
    const paceInput = document.getElementById('user-pace');
    const timeModeSelect = document.getElementById('time-mode');
    const routeTimeInput = document.getElementById('route-time');

    const updateTimeStats = () => {
        if (!currentRouteData) return;
        const pace = parseFloat(paceInput.value) || 20;
        const distKm = currentRouteData.distance / 1000;
        const durationMs = (distKm / pace) * 3600 * 1000;

        const inputTime = new Date(routeTimeInput.value || new Date());
        let start, end;

        if (timeModeSelect.value === 'arrive') {
            end = inputTime;
            start = new Date(end.getTime() - durationMs);
        } else {
            start = inputTime;
            end = new Date(start.getTime() + durationMs);
        }

        const stats = document.getElementById('stats-container');
        let timeStat = document.getElementById('time-stat');
        if (!timeStat) {
            timeStat = document.createElement('div');
            timeStat.className = 'stat-box';
            timeStat.id = 'time-stat';
            stats.appendChild(timeStat);
        }
        timeStat.innerHTML = `<span class="label">Schedule</span><div class="value" style="font-size:0.9rem">${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
    };

    paceInput.onchange = updateTimeStats;
    timeModeSelect.onchange = updateTimeStats;
    routeTimeInput.onchange = updateTimeStats;
    updateTimeStats(); // Initial call

    const coords = route.geometry.coordinates;
    const weather = await fetchWindAtLocation(coords[0][1], coords[0][0]);
    if (weather) {
        const score = calculateRouteWindScore(route.geometry, weather.bearing);
        updateSidebarUI(score, weather);
    }

    // Generate and Draw Elevation Profile
    // Show loading state first while waiting for terrain data
    let elevContainer = document.getElementById('elevation-container');
    if (!elevContainer) {
        elevContainer = document.createElement('div');
        elevContainer.id = 'elevation-container';
        const statsContainer = document.getElementById('stats-container');
        statsContainer.parentNode.insertBefore(elevContainer, statsContainer.nextSibling);
    }
    
    elevContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px;">
            <div class="spin-anim" style="width:24px; height:24px; border:3px solid #e0e0e0; border-top-color:var(--accent-blue); border-radius:50%;"></div>
            <span style="margin-top:10px; font-size:0.9rem; color:var(--text-secondary);">Calculating elevation...</span>
        </div>
    `;

    const updateElevation = () => {
        const elevationData = getElevationProfile(map, coords);

        // --- Calories Estimator ---
        // Formula: ~25 kcal/km + 1.5 kcal per meter climbed
        let cumulativeGain = 0;
        const elevations = elevationData.map(d => d.elevation);
        for (let i = 1; i < elevations.length; i++) {
            if (elevations[i] > elevations[i - 1]) cumulativeGain += (elevations[i] - elevations[i - 1]);
        }
        const distKm = currentRouteData.distance / 1000;
        const calories = Math.round((distKm * 25) + (cumulativeGain * 1.5));

        const statsContainer = document.getElementById('stats-container');
        statsContainer.style.gridTemplateColumns = '1fr 1fr 1fr'; // Add column for calories
        if (!document.getElementById('cal-stat')) {
            const calDiv = document.createElement('div');
            calDiv.className = 'stat-box';
            calDiv.id = 'cal-stat';
            calDiv.innerHTML = `<span class="label">Est. Burn</span><div class="value" id="cal-val"></div>`;
            statsContainer.appendChild(calDiv);
        }
        document.getElementById('cal-val').innerText = `${calories} kcal`;
        // --------------------------

        renderElevationChart(elevationData);
    };
    // Wait for map to settle (load terrain tiles) to ensure accurate elevation data
    map.once('idle', updateElevation);

    // Add Animation Controls (Play + Speed Slider)
    const statsContainer = document.getElementById('stats-container');

    // Remove existing controls if any (to avoid duplicates on re-route)
    const existingControls = document.getElementById('animation-controls');
    if (existingControls) existingControls.remove();

    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'animation-controls';
    controlsDiv.innerHTML = `
        <div style="display:flex; gap:8px; width:100%;">
            <button id="play-route-btn" class="secondary-btn" style="flex:1;"><i data-feather="play-circle"></i> Play</button>
        </div>
        <div class="speed-control">
            <label>Speed (x):</label>
            <input type="range" id="anim-speed" min="10" max="200" step="10" value="50" title="Multiplier of real-time speed">
        </div>
    `;
    statsContainer.parentNode.insertBefore(controlsDiv, statsContainer);

    const playBtn = document.getElementById('play-route-btn');
    playBtn.onclick = () => {
        if (playBtn.innerText.includes('Pause')) {
            togglePause();
            playBtn.innerHTML = `<i data-feather="play-circle"></i> Resume`;
            if (feather) feather.replace();
            return;
        }

        playBtn.innerHTML = `<i data-feather="pause-circle"></i> Pause`;
        if (feather) feather.replace();

        const speed = parseFloat(document.getElementById('anim-speed').value);
        // Calculate duration based on user pace input
        const paceKmH = parseFloat(document.getElementById('user-pace').value) || 20;
        const realDurationHours = (currentRouteData.distance / 1000) / paceKmH;
        const realDurationMs = realDurationHours * 3600 * 1000;
        lastLogicalWeatherUrl = null; // Reset weather tracker on new play

        playRouteAnimation(map, coords, realDurationMs, speed, (progress) => {
            updateWeatherForProgress(progress, realDurationHours);
        });
    };

    // Allow speed adjustment midway
    document.getElementById('anim-speed').oninput = (e) => {
        setAnimationSpeed(parseFloat(e.target.value));
    };


    if (feather) feather.replace();

    const list = document.getElementById('directions-list');
    list.innerHTML = '';

    if (route.legs && route.legs.length > 0) {
        route.legs[0].steps.forEach((step, index) => {
            const [lng, lat] = step.maneuver.location;
            // Mapbox Static Image for the turn

            const div = document.createElement('div');
            div.className = 'direction-step';
            div.innerHTML = `
                <div class="step-info">
                    <div class="step-instr">${index + 1}. ${step.maneuver.instruction}</div>
                    <div class="step-meta">
                        <span>${(step.distance).toFixed(0)}m</span>
                        <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" class="sv-link">Street View <i data-feather="external-link"></i></a>
                    </div>
                </div>
            `;
            div.addEventListener('click', () => {
                map.flyTo({ center: [lng, lat], zoom: 17, pitch: 45 });
            });
            list.appendChild(div);
        });
        if (feather) feather.replace();
    } else {
        list.innerHTML = '<p class="empty-state">No steps found.</p>';
    }
}

// --- MET OFFICE WEATHER LOGIC ---
// --- MET OFFICE WEATHER LOGIC ---
async function updateWeatherForProgress(progress, durationHours) {
    // 1. Calculate the "Simulated Time"
    const timeMode = document.getElementById('time-mode').value;
    const routeTimeInput = document.getElementById('route-time');
    if (!routeTimeInput || !routeTimeInput.value) return;

    const inputTime = new Date(routeTimeInput.value);

    let startTime;
    if (timeMode === 'arrive') {
        startTime = new Date(inputTime.getTime() - (durationHours * 60 * 60 * 1000));
    } else {
        startTime = inputTime;
    }

    const simulatedTime = new Date(startTime.getTime() + (progress * durationHours * 60 * 60 * 1000));

    // 2. Determine if we need Observation (Past) or Forecast (Future)
    const now = new Date();
    const observationCutoff = new Date(now.getTime() - 20 * 60 * 1000);

    let url;

    if (simulatedTime > observationCutoff) {
        // FORECAST (Future or very recent past)
        const modelRun = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        modelRun.setMinutes(0, 0, 0, 0);

        const diffMs = simulatedTime.getTime() - modelRun.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        let config = 'short';
        let ptStr = '';

        if (diffHours <= 11) {
            const msPer15 = 15 * 60 * 1000;
            const roundedDiff = Math.round(diffMs / msPer15) * msPer15;

            const totalMins = Math.floor(roundedDiff / 60000);
            const h = Math.floor(totalMins / 60);
            const m = totalMins % 60;

            ptStr = 'PT';
            if (h === 0 && m === 0) ptStr += '0S';
            else {
                if (h > 0) ptStr += `${h}H`;
                if (m > 0) ptStr += `${m}M`;
            }
        } else {
            config = 'long';
            const h = Math.round(diffHours);
            ptStr = `PT${h}H`;
        }

        const runIso = modelRun.toISOString().split('.')[0] + 'Z';
        url = `https://maps.consumer-digital.api.metoffice.gov.uk/wms_fc/single/high-res/${config}/total_precipitation_rate/${runIso}/${ptStr}.png`;
    } else {
        // OBSERVATION (Older than 20 mins)
        const msPer15 = 15 * 60 * 1000;
        const roundedObs = new Date(Math.round(simulatedTime.getTime() / msPer15) * msPer15);
        const isoStr = roundedObs.toISOString().split('.')[0] + 'Z';
        url = `https://maps.consumer-digital.api.metoffice.gov.uk/wms_ob/single/high-res/rainfall_radar/${isoStr}.png`;
    }

    // 4. Update Layer
    if (map.getLayer('met-office-radar')) {
        map.setLayoutProperty('met-office-radar', 'visibility', 'visible');
    }

    if (url !== lastLogicalWeatherUrl) {
        lastLogicalWeatherUrl = url;

        // 1. Add a unique timestamp to bypass any "poisoned" browser cache
        const finalUrl = `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`;

        const xhr = new XMLHttpRequest();
        xhr.open('GET', finalUrl, true);
        xhr.responseType = 'blob'; // We want the raw data

        xhr.onload = function() {
            if (this.status === 200) {
                const blob = this.response;
                const blobUrl = URL.createObjectURL(blob);

                // Clean up memory from the previous frame
                if (window.lastRadarBlobUrl) {
                    URL.revokeObjectURL(window.lastRadarBlobUrl);
                }
                window.lastRadarBlobUrl = blobUrl;

                // Pass the Blob URL (a local string) to the map engine
                updateMetOfficeLayer(map, blobUrl, [-25, 44.02, 16, 64]);
            }
        };

        xhr.onerror = function() {
            console.error("CORS block or Network failure on radar frame.");
        };

        xhr.send();
    }
}

const updateSidebarUI = (score, weather) => {
    document.getElementById('tw-val').innerText = `${score.percentage}%`;
    document.getElementById('hw-val').innerText = `${100 - score.percentage}%`;
    document.getElementById('weather-desc').innerText = `Wind: ${weather.speed}m/s from ${weather.bearing}°`;
};

const loadSavedList = async () => {
    if (!currentUser) return;
    const list = document.getElementById('saved-routes-list');
    list.innerHTML = '<p class="empty-state">Loading...</p>';
    const routes = await fetchAllRoutes(currentUser.uid);

    // Inject Sort Controls if they don't exist
    const container = document.getElementById('saved-tab');
    if (!document.getElementById('sort-controls')) {
        const sortDiv = document.createElement('div');
        sortDiv.id = 'sort-controls';
        sortDiv.style.padding = '0 0 12px 0';
        sortDiv.innerHTML = `
            <select id="sort-select" style="width:100%; padding:8px; border-radius:6px; border:1px solid #e0e0e0;">
                <option value="date">Sort by: Date (Newest)</option>
                <option value="distance">Sort by: Distance (Longest)</option>
            </select>
        `;
        container.insertBefore(sortDiv, list);

        document.getElementById('sort-select').addEventListener('change', (e) => {
            currentSort = e.target.value;
            loadSavedList(); // Reload list
        });
    }

    if (!routes || routes.length === 0) {
        list.innerHTML = '<p class="empty-state">No saved rides yet.</p>';
        return;
    }

    // Apply Sorting
    routes.sort((a, b) => currentSort === 'distance' ? b.distance - a.distance : b.timestamp - a.timestamp);

    list.innerHTML = '';
    routes.forEach(r => {
        const div = document.createElement('div');
        div.className = 'saved-route-item';

        const dateStr = r.timestamp?.toDate ? r.timestamp.toDate().toLocaleDateString() : 'Unknown date';

        // Content Container
        const contentDiv = document.createElement('div');
        contentDiv.style.flex = '1';
        contentDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong>${r.name}</strong>
                <span style="font-size:0.8em; color:#888;">${dateStr}</span>
            </div>
            <small>Distance: ${(r.distance / 1000).toFixed(2)} km • Score: ${r.tailwindScore}%</small>
        `;

        // Delete Button
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-route-btn';
        delBtn.innerHTML = '<i data-feather="trash-2"></i>';
        delBtn.title = "Delete Route";
        delBtn.onclick = async (e) => {
            e.stopPropagation(); // Prevent opening the route
            if (confirm(`Are you sure you want to delete "${r.name}"?`)) {
                delBtn.innerHTML = `<i data-feather="loader" class="spin-anim"></i>`;
                if (feather) feather.replace();
                await deleteRouteFromCloud(r.id);
                loadSavedList(); // Refresh list
            }
        };

        div.appendChild(contentDiv);
        div.appendChild(delBtn);

        div.onclick = async () => {
            const geo = JSON.parse(r.geometry);
            const routeWaypoints = [geo.coordinates[0], geo.coordinates[geo.coordinates.length - 1]];
            const freshRoute = await drawWindRoute(map, routeWaypoints);
            if (freshRoute) {
                switchTab('directions'); // Switch first so chart can render correctly
                handleRouteSelection(freshRoute, false);
            }
        };
        list.appendChild(div);
    });
};

function locateUser() {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    
    const onLocationFound = async (position) => {
        const { longitude, latitude } = position.coords;
        userLocation = [longitude, latitude]; // Update global state
        waypoints[0] = [longitude, latitude];

        const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}`);
        const data = await response.json();
        const address = data.features[0]?.place_name || "Current Location";

        geocoders[0].setInput(address);
        map.flyTo({ center: [longitude, latitude], zoom: 14 });
        addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
    };

    navigator.geolocation.getCurrentPosition(onLocationFound, (err) => {
        console.warn("Location access error:", err);
        if (err.code === 1) {
            if (err.message.includes("secure origin")) {
                console.warn("⚠️ Secure Origin Error. Bypassing with Mock Location (London).");
                onLocationFound({ coords: { longitude: -0.1276, latitude: 51.5072 } });
                return;
            }
            alert("Location permission denied.\n\nPlease enable location services for this site in your browser settings.");
        } else {
            alert("Could not get precise location. " + err.message);
        }
    }, GEO_OPTIONS);
}

async function handleSaveButtonClick() {
    if (!currentRouteData || !currentUser) return;
    const routeName = prompt("Enter a name for this route:", "My Awesome Ride");
    if (!routeName) return;

    const start = currentRouteData.geometry.coordinates[0];
    const weather = await fetchWindAtLocation(start[1], start[0]);
    const score = calculateRouteWindScore(currentRouteData.geometry, weather?.bearing || 0);

    const data = {
        userId: currentUser.uid,
        name: routeName,
        geometry: JSON.stringify(currentRouteData.geometry),
        distance: currentRouteData.distance,
        tailwindScore: score.percentage,
        rating: score.rating
    };

    await saveRouteToCloud(data);
    loadSavedList();
    switchTab('saved');
}

const calculateRouteWindScore = (geometry, windBearing) => {
    let good = 0;
    const coords = geometry.coordinates;
    if (!coords || coords.length < 2) return { percentage: 0, rating: "N/A" };

    for (let i = 0; i < coords.length - 1; i++) {
        // Safety check to prevent "coord is required" error
        if (!coords[i] || !coords[i + 1]) continue;
        const roadBearing = turf.bearing(coords[i], coords[i + 1]);
        if (calculateWindImpact(roadBearing, windBearing) === 'tailwind') good++;
    }
    const percentage = Math.round((good / (coords.length - 1)) * 100) || 0;
    return { percentage, rating: percentage > 70 ? "Epic 🚀" : "Grind 🥵" };
};

async function searchNearbyPOIs(category) {
    if (!currentRouteData) return;

    // Clear existing
    poiMarkers.forEach(m => m.remove());
    poiMarkers = [];
    document.getElementById('clear-poi').style.display = 'block';

    // Use Route Bounding Box for search
    const bbox = turf.bbox(currentRouteData.geometry);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${category}.json?bbox=${bbox.join(',')}&limit=15&access_token=${MAPBOX_TOKEN}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        data.features.forEach(feature => {
            // Create Popup
            const popup = new mapboxgl.Popup({ offset: 25 })
                .setHTML(`<strong>${feature.text}</strong><br>${feature.properties.address || ''}`);

            // Create Marker
            const el = document.createElement('div');
            el.className = 'poi-marker';
            el.innerHTML = category === 'cafe' ? '☕' : category === 'gas_station' ? '⛽' : '🍔';

            const marker = new mapboxgl.Marker(el)
                .setLngLat(feature.center)
                .setPopup(popup)
                .addTo(map);

            poiMarkers.push(marker);
        });

        if (data.features.length === 0) alert("No results found nearby.");
    } catch (e) {
        console.error("POI Search Error:", e);
    }
}

async function startLiveSessionUI() {
    if (!currentUser) return alert("Please log in to share your live location.");
    if (!navigator.geolocation) return alert("Geolocation not supported.");

    return new Promise((resolve, reject) => {
        const onLocationFound = async (pos) => {
            try {
                const coords = [pos.coords.longitude, pos.coords.latitude];
                const routeGeo = currentRouteData ? currentRouteData.geometry : null;
                liveSessionId = await createLiveSession(currentUser.uid, coords, routeGeo);
                const url = `${window.location.origin}${window.location.pathname}?track=${liveSessionId}`;

                renderLinkBox("Live Tracking Link", url);

                // Force start navigation/tracking if not already
                if (!isNavigating) toggleNavigation();
                resolve();
            } catch (e) {
                console.error("Error starting live session:", e);
                reject(e);
            }
        };

        navigator.geolocation.getCurrentPosition(onLocationFound, (err) => {
            if (err.code === 1) {
                if (err.message.includes("secure origin")) {
                    alert("⚠️ HTTPS Required. Using Mock Location (London) for testing.");
                    onLocationFound({ coords: { longitude: -0.1276, latitude: 51.5072 } });
                    return;
                }
                alert("Location permission denied. Please enable location services.");
            } else {
                alert("Location error: " + err.message);
            }
            reject(err);
        }, GEO_OPTIONS);
    });
}

function initTrackingMode(sessionId) {
    // Replace Sidebar Content with Tracking UI
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="panel-content">
            <div class="title-container"><h1>📡 Live Tracking</h1></div>
            <div class="stat-box" style="margin-top:20px; text-align:center;">
                <p>Tracking user location...</p>
                <div id="last-update" style="font-size:0.8em; color:#888; margin-top:8px;">Waiting for signal...</div>
            </div>
            <button class="secondary-btn" onclick="window.location.href='/'" style="margin-top:20px;">
                <i data-feather="map"></i> Go to Route Planner
            </button>
        </div>
    `;
    if (feather) feather.replace();

    subscribeToLiveSession(sessionId, (data) => {
        if (data) {
            // Draw Route if available and not yet drawn
            if (data.routeGeometry && !map.getSource('route')) {
                try {
                    const geo = typeof data.routeGeometry === 'string' ? JSON.parse(data.routeGeometry) : data.routeGeometry;
                    drawStaticRoute(map, geo);
                } catch (e) { console.error("Error parsing route geometry", e); }
            }

            if (data.lastLocation) {
            const { lat, lng } = data.lastLocation;
            const pos = [lng, lat];

            if (!remoteMarker) {
                const el = document.createElement('div');
                el.className = 'user-marker';
                el.style.backgroundColor = '#e74c3c'; // Red for friend
                remoteMarker = new mapboxgl.Marker(el).setLngLat(pos).addTo(map);
            } else {
                remoteMarker.setLngLat(pos);
            }

            map.flyTo({ center: pos, zoom: 15 });
            document.getElementById('last-update').innerText = 'Last update: ' + new Date().toLocaleTimeString();
            }
        }
    });
}

// --- NAVIGATION ---
function toggleNavigation() {
    isNavigating = !isNavigating;
    document.getElementById('nav-btn').classList.toggle('active', isNavigating);
    if (isNavigating) startLiveTracking();
    else stopLiveTracking();
}

function startLiveTracking() {
    if (!navigator.geolocation) return alert("Geolocation not supported");

    speak("Starting navigation.");
    isNavigating = true;

    // Check if user is near the start point
    const checkProximity = (pos) => {
        const userPos = [pos.coords.longitude, pos.coords.latitude];
        if (currentRouteData) {
            const startPoint = currentRouteData.geometry.coordinates[0];
            const distKm = turf.distance(userPos, startPoint, { units: 'kilometers' });
            
            if (distKm > 0.2) { // User is > 200m away from start
                if (confirm("You are not at the start. Reroute from current location?")) {
                    waypoints[0] = userPos;
                    if (geocoders[0]) geocoders[0].setInput("Current Location");
                    calculateRoute();
                }
            }
        }
    };

    navigator.geolocation.getCurrentPosition(checkProximity, err => {
        console.warn("Initial location check failed", err);
        if (err.code === 1) {
            if (err.message.includes("secure origin")) {
                console.warn("⚠️ Secure Origin Error. Bypassing proximity check with Mock Location.");
                checkProximity({ coords: { longitude: -0.1276, latitude: 51.5072 } });
                return;
            }
            alert("Location permission denied. Navigation cannot start.");
        }
    }, GEO_OPTIONS);

    watchId = navigator.geolocation.watchPosition(pos => {
        handlePositionUpdate([pos.coords.longitude, pos.coords.latitude]);
    }, err => {
        console.warn("Watch Position Error:", err);
        // Stop watching if permission is denied or insecure origin to prevent loop
        if (err.code === 1) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            isNavigating = false;
            // Suppress alert for secure origin to allow "bypass" feel (just stops tracking)
            if (!err.message.includes("secure origin")) {
                 alert("Live Navigation stopped: Permission denied.");
            } else {
                 console.warn("Live Navigation stopped: HTTPS required.");
            }
        }
    }, GEO_OPTIONS);
}

function handlePositionUpdate(userPos) {
    // Update User Marker
    if (!userMarker) {
        const el = document.createElement('div');
        el.className = 'user-marker';
        userMarker = new mapboxgl.Marker(el).setLngLat(userPos).addTo(map);
    } else {
        userMarker.setLngLat(userPos);
    }

    // Update Live Session if active
    if (liveSessionId) {
        updateLiveSession(liveSessionId, userPos);
    }

    // Follow user if navigating
    if (isNavigating) {
        map.easeTo({ center: userPos, zoom: 18, pitch: 50 });
    }

    // Voice Instructions
    if (currentRouteData && currentRouteData.legs && currentRouteData.legs[0]) {
        const steps = currentRouteData.legs[0].steps;
        steps.forEach((step, index) => {
            if (!step.maneuver || !step.maneuver.location) return; // Safety check
            const stepLoc = step.maneuver.location;
            const dist = turf.distance(userPos, stepLoc, { units: 'meters' });

            if (dist < 40 && index > lastSpokenStepIndex) {
                speak(step.maneuver.instruction);
                lastSpokenStepIndex = index;
            }
        });
    }
}

function stopLiveTracking() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    isNavigating = false;
    lastSpokenStepIndex = -1;
}

// --- THEME & SHARING ---
function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode');
        // Note: Map style switching requires reloading layers, keeping it simple for now
        // or we can switch map style if desired, but it clears the route.
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Optional: Switch Map Style (Requires redrawing route if active)
    const style = isDark ? 'mapbox://styles/mapbox/navigation-night-v1' : 'mapbox://styles/mapbox/navigation-day-v1';
    map.setStyle(style);

    map.once('style.load', () => {

        // Redraw route if exists
        if (currentRouteData) {
            drawWindRoute(map, currentRouteData.geometry.coordinates);
        }
    });
}

function showLinkUI(route) {
    const coords = route.geometry.coordinates;
    const start = coords[0].join(',');
    const end = coords[coords.length - 1].join(',');
    const url = `${window.location.origin}${window.location.pathname}?start=${start}&end=${end}`;
    renderLinkBox("Route Link", url);
}

function renderLinkBox(label, url) {
    const container = document.getElementById('share-output-area');
    container.innerHTML = `
        <div style="background:#f1f3f4; padding:12px; border-radius:8px; border:1px solid var(--border-color);">
            <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary);">${label}</label>
            <div class="link-box">
                <input type="text" value="${url}" readonly id="share-url-input">
                <button class="copy-btn" id="copy-share-btn">Copy</button>
            </div>
        </div>
    `;
    
    document.getElementById('copy-share-btn').onclick = () => {
        const input = document.getElementById('share-url-input');
        input.select();
        input.setSelectionRange(0, 99999); // Mobile
        navigator.clipboard.writeText(input.value).then(() => {
            const btn = document.getElementById('copy-share-btn');
            btn.innerText = "Copied!";
            setTimeout(() => btn.innerText = "Copy", 2000);
        }).catch(err => {
            console.error("Clipboard failed", err);
            alert("Please copy the link manually.");
        });
    };
}

async function withLoading(element, asyncFn) {
    const originalContent = element.innerHTML;
    element.style.pointerEvents = 'none';
    element.innerHTML = `<i data-feather="loader" class="spin-anim"></i>`;
    if (feather) feather.replace();
    try { await asyncFn(); } 
    catch (e) { console.error(e); alert("Action failed."); } 
    finally {
        element.innerHTML = originalContent;
        element.style.pointerEvents = 'auto';
        if (feather) feather.replace();
    }
}

async function checkUrlForRoute() {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    const end = params.get('end');

    if (start && end) {
        waypoints[0] = start.split(',').map(Number);
        waypoints[1] = end.split(',').map(Number);

        // Update Geocoders visually (reverse geocoding optional but good)
        geocoders[0].setInput(start);
        geocoders[1].setInput(end);

        addRouteMarkers(map, waypoints, handleMarkerDrag);
        calculateRoute();
    }
}

function injectCustomStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Fix for Geocoder Dropdown blocking UI */
        .mapboxgl-ctrl-geocoder .suggestions {
            max-height: 200px;
            overflow-y: auto;
            background-color: #fff;
            border: 1px solid #e0e0e0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000 !important;
        }
        /* Ensure active dropdown appears above other inputs */
        .location-input-wrapper {
            position: relative;
            z-index: 1;
        }
        .location-input-wrapper:focus-within {
            z-index: 100;
        }
    `;
    document.head.appendChild(style);
}

function renderElevationChart(data) {
    const statsContainer = document.getElementById('stats-container');
    let container = document.getElementById('elevation-container');

    if (!container) {
        container = document.createElement('div');
        container.id = 'elevation-container';
        statsContainer.parentNode.insertBefore(container, statsContainer.nextSibling);
    }

    // Fix: Check if canvas exists. If container has spinner (loading state), overwrite it.
    if (!document.getElementById('elevation-canvas')) {
         container.innerHTML = `
            <div class="chart-header">
                <span class="label">Elevation Profile</span>
                <span class="value" id="elev-gain"></span>
            </div>
            <canvas id="elevation-canvas"></canvas>
        `;
    }

    const canvas = document.getElementById('elevation-canvas');
    const ctx = canvas.getContext('2d');

    // 1. Setup Dimensions & DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const margin = { top: 20, right: 10, bottom: 20, left: 35 };

    canvas.width = rect.width * dpr;
    canvas.height = 160 * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = '100%';
    canvas.style.height = '160px';

    const width = rect.width - margin.left - margin.right;
    const height = 160 - margin.top - margin.bottom;

    // 2. Calculate Scales
    const elevations = data.map(d => d.elevation);
    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const totalDist = data[data.length - 1].distance;
    const range = maxElev - minElev || 10; // Avoid divide by zero

    // 3. Update Header Text
    const gain = Math.round(maxElev - minElev);
    document.getElementById('elev-gain').innerText = `+${gain}m`;

    // 4. Draw Function
    const draw = (mouseX = null) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(margin.left, margin.top);

        // Draw Axes
        ctx.beginPath();
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        // Y Axis
        ctx.moveTo(0, 0); ctx.lineTo(0, height);
        // X Axis
        ctx.moveTo(0, height); ctx.lineTo(width, height);
        ctx.stroke();

        // Axis Labels
        ctx.fillStyle = '#5f6368';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(maxElev)}m`, -5, 0);
        ctx.fillText(`${Math.round(minElev)}m`, -5, height);
        ctx.textAlign = 'center';
        ctx.fillText(`${(totalDist / 1000).toFixed(1)}km`, width, height + 15);

        // Draw Area Path
        ctx.beginPath();
        ctx.moveTo(0, height);
        data.forEach(d => {
            const x = (d.distance / totalDist) * width;
            const y = height - ((d.elevation - minElev) / range) * height;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(56, 135, 190, 0.2)';
        ctx.fill();

        // Draw Line
        ctx.beginPath();
        data.forEach(d => {
            const x = (d.distance / totalDist) * width;
            const y = height - ((d.elevation - minElev) / range) * height;
            ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#3887be';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Hover Effect
        if (mouseX !== null) {
            const xRatio = Math.max(0, Math.min(1, (mouseX - margin.left) / width));
            const targetDist = xRatio * totalDist;
            // Find nearest point
            const point = data.reduce((prev, curr) =>
                Math.abs(curr.distance - targetDist) < Math.abs(prev.distance - targetDist) ? curr : prev
            );

            const x = (point.distance / totalDist) * width;
            const y = height - ((point.elevation - minElev) / range) * height;

            // Draw Vertical Line
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, height);
            ctx.strokeStyle = '#212121';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw Dot
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.stroke();

            // Tooltip Text
            ctx.fillStyle = '#212121';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${Math.round(point.elevation)}m`, x, y - 10);

            // Update Map Marker
            if (!elevationMarker) {
                elevationMarker = new mapboxgl.Marker({ color: '#f39c12', scale: 0.8 }).setLngLat(point.coord).addTo(map);
            } else {
                elevationMarker.setLngLat(point.coord);
            }
        } else {
            if (elevationMarker) {
                elevationMarker.remove();
                elevationMarker = null;
            }
        }

        ctx.translate(-margin.left, -margin.top); // Reset transform
    };

    // Initial Draw
    draw();

    // Event Listeners
    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left); // Scale not needed for logic, only drawing
        draw(x);
    };
    canvas.onmouseleave = () => {
        draw(null);
    };
}

function speak(text) {
    if (!speechSynth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynth.speak(utterance);
}

async function downloadGPX(route) {
    if (!route) return;
    const coords = route.geometry.coordinates;

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RoutePlanner">
  <trk>
    <name>Route Export</name>
    <trkseg>
`;

    coords.forEach(pt => {
        gpx += `      <trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>\n`;
    });

    gpx += `    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'route.gpx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Small delay to show loading spinner
    await new Promise(r => setTimeout(r, 500));
}

function handleMarkerDrag(index, newCoords) {
    // Map the index from the filtered markers back to the main waypoints array
    let realIndex = -1;
    let filteredCount = 0;
    for (let i = 0; i < waypoints.length; i++) {
        if (waypoints[i]) {
            if (filteredCount === index) {
                realIndex = i;
                break;
            }
            filteredCount++;
        }
    }

    if (realIndex !== -1) {
        waypoints[realIndex] = newCoords;
        if (waypoints.filter(w => w).length >= 2) calculateRoute();
    }
}

async function captureRouteSnapshot() {
    if (!currentRouteData) return;

    // Force a repaint to ensure canvas is up to date
    map.triggerRepaint();

    // Wait for next frame
    requestAnimationFrame(() => {
        const canvas = map.getCanvas();
        const dataURL = canvas.toDataURL('image/png');

        // Create a temporary canvas to composite stats
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
            // Draw Map
            ctx.drawImage(img, 0, 0);

            // Draw Overlay Box
            ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
            ctx.fillRect(20, 20, 320, 100);

            // Draw Text
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.fillText("Route Snapshot", 40, 60);

            ctx.font = '16px Inter, sans-serif';
            ctx.fillText(`Distance: ${(currentRouteData.distance / 1000).toFixed(2)} km`, 40, 90);

            // Trigger Download
            const link = document.createElement('a');
            link.download = `route-${Date.now()}.png`;
            link.href = tempCanvas.toDataURL();
            link.click();
        };
        img.src = dataURL;
    });
}