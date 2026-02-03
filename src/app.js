import { auth, googleProvider, saveRouteToCloud, fetchAllRoutes, deleteRouteFromCloud, createLiveSession, updateLiveSession, endLiveSession, subscribeToLiveSession, updateRouteName, saveSharedRoute, fetchSharedRoute, sendReaction, updateViewerCount, sendChatMessage, subscribeToChat, registerViewer, subscribeToViewers, kickViewer } from './firebase.js';
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { fetchWindAtLocation, fetchRouteForecast } from './weather-api.js';
import { calculateWindImpact } from './geo-logic.js';
import { initMap, fetchRouteAlternatives, drawStaticRoute, addRouteMarkers, clearRoute, getElevationProfile, playRouteAnimation, stopRouteAnimation, toggleTraffic, toggleWeather, setAnimationSpeed, togglePause, updateMetOfficeLayer, toggleTerrain, restoreWeather } from './map-engine.js';
import { MAPBOX_TOKEN } from './config.js';

// --- GLOBAL STATE ---
let currentUser = null;
let currentRouteData = null;
let waypoints = [null, null]; // Array to hold coordinates for multi-stop routes
let currentFeatures = [null, null]; // Store full GeoJSON features for favorites
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
let liveSessionUnsubscribe = null; // To listen for reactions as host
let chatUnsubscribe = null;
let chatOverlayUnsubscribe = null;
let viewerOverlayUnsubscribe = null;
let lastReactionTime = 0;
let remoteMarker = null;
let metOfficeTimestamps = [];
let lastLogicalWeatherUrl = null;
let lastBlobUrl = null;
let compassMode = 'north'; // 'north' | 'heading'
let isMuted = false;
let isTerrainEnabled = false;
let mockIntervalId = null; // To track simulated movement on HTTP
let currentMapStyle = 'mapbox://styles/mapbox/navigation-night-v1'; // Default
let lastWeatherFetchDist = 0; // Track distance for weather throttling
const WEATHER_FETCH_INTERVAL_KM = 25; // Fetch weather every 25km during animation

let recentLocations = []; // Track history for bearing calculation
let lastKnownHeading = 0;
let isRerouting = false;
let wrongWayState = { active: false, startTime: 0, isAlerting: false };

const GEO_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 15000, // Wait up to 15s for a GPS lock
    maximumAge: 0   // Force fresh GPS data, do not use cache
};

const map = initMap('map');

// --- HISTORY HELPERS ---
const addToHistory = (feature) => {
    if (!feature || !feature.place_name) return;
    try {
        let history = JSON.parse(localStorage.getItem('location_history') || '[]');
        // Remove duplicates (by id or place_name)
        history = history.filter(item => item.id !== feature.id && item.place_name !== feature.place_name);
        // Add new item to start
        history.unshift(feature);
        // Limit to 5 items
        if (history.length > 5) history.pop();
        localStorage.setItem('location_history', JSON.stringify(history));
    } catch (e) {
        console.error("Error saving history:", e);
    }
};

const getFavorites = () => JSON.parse(localStorage.getItem('location_favorites') || '[]');

const toggleFavorite = (index, btn) => {
    const feature = currentFeatures[index];
    if (!feature) return;

    let favs = getFavorites();
    const existingIdx = favs.findIndex(f => f.place_name === feature.place_name);

    if (existingIdx > -1) {
        favs.splice(existingIdx, 1); // Remove
        btn.classList.remove('active');
        btn.innerHTML = `<i data-feather="star"></i>`;
    } else {
        favs.push(feature); // Add
        btn.classList.add('active');
        btn.innerHTML = `<i data-feather="star" fill="currentColor"></i>`;
    }
    localStorage.setItem('location_favorites', JSON.stringify(favs));
    if (feather) feather.replace();
};

const searchLocal = (query) => {
    try {
        const favorites = getFavorites().map(item => {
            if (!item.properties) item.properties = {};
            item.properties.maki = 'star'; 
            item.place_name = '⭐ ' + item.place_name.replace('⭐ ', ''); // Visual cue
            return item;
        });

        const history = JSON.parse(localStorage.getItem('location_history') || '[]');
        const historyItems = history.map(item => {
            if (!item.properties) item.properties = {};
            item.properties.maki = 'clock'; 
            return item;
        });

        const all = [...favorites, ...historyItems];
        return all.filter(item => item.place_name.toLowerCase().includes(query.toLowerCase()));
    } catch (e) {
        return [];
    }
};


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
                if (loginBtn) loginBtn.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'block';
                if (userProfile) userProfile.style.display = 'flex';
                if (trackId) initTrackingMode(trackId);
                else loadSavedList();
            } else {
                currentUser = null;
                if (userProfile) userProfile.style.display = 'none';
                if (loginBtn) loginBtn.style.display = 'block';
                if (logoutBtn) logoutBtn.style.display = 'none';
                if (trackId) initTrackingMode(trackId);
                else if (document.getElementById('saved-routes-list')) document.getElementById('saved-routes-list').innerHTML = '<p class="empty-state">Please log in to see your routes.</p>';
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

    // --- INJECT WEATHER TAB ---
    const weatherTabBtn = document.createElement('button');
    weatherTabBtn.className = 'tab-btn';
    weatherTabBtn.dataset.tab = 'weather';
    weatherTabBtn.innerHTML = 'Weather';
    weatherTabBtn.addEventListener('click', () => switchTab('weather'));
    // Insert before Share tab if possible
    if (tabContainer.lastChild.innerText === 'Share') {
        tabContainer.insertBefore(weatherTabBtn, tabContainer.lastChild);
    } else {
        tabContainer.appendChild(weatherTabBtn);
    }

    const weatherTabContent = document.createElement('div');
    weatherTabContent.id = 'weather-tab';
    weatherTabContent.className = 'tab-content';
    weatherTabContent.innerHTML = `
        <div class="weather-dashboard">
            <div class="current-wx-row">
                <img id="wx-icon" src="" class="wx-icon-large" alt="Weather" style="display:none">
                <div class="wx-temp-group">
                    <span id="wx-temp-val" class="wx-temp-large">--</span>
                    <span class="wx-unit">°C</span>
                    <div class="wx-feels">Feels <span id="wx-feels">--</span>°</div>
                </div>
            </div>
            <div id="wx-desc" class="wx-condition-text">Plan a route to see weather</div>
            <div id="wx-forecast-container" class="forecast-scroller"></div>
            
            <div class="wx-stats-grid">
                <div class="wx-stat-card">
                    <i data-feather="wind"></i>
                    <span id="wx-gust">--</span>
                    <label>Gusts (m/s)</label>
                </div>
                <div class="wx-stat-card">
                    <i data-feather="droplet"></i>
                    <span id="wx-humidity">--</span>
                    <label>Humidity %</label>
                </div>
            </div>
            
            <!-- Wind Impact Section (Moved from Sidebar) -->
            <div class="wind-impact-section" style="margin-top:20px; padding-top:15px; border-top:1px solid var(--border-color);">
    <h3 style="font-size:0.9rem; margin-bottom:10px; color:var(--text-secondary);">Route Wind Impact</h3>
    
    <div class="impact-meter" style="margin-bottom:12px;">
        <div class="impact-label" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
            <span>Tailwind</span>
            
            <span id="wx-tw-val">--%</span>
        </div>
        <div class="meter-track" style="height:6px; background:#ddd; border-radius:3px; overflow:hidden;">
            <div id="tw-bar" style="width:0%; height:100%; background:#2ecc71; transition:width 0.5s ease;"></div>
            <div id="wx-tw-bar" style="width:0%; height:100%; background:#2ecc71; transition:width 0.5s ease;"></div>
        </div>
    </div>
    
    <div class="impact-meter" style="margin-bottom:12px;">
        <div class="impact-label" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
            <span>Headwind</span>
            
            <span id="wx-hw-val">--%</span>
        </div>
        <div class="meter-track" style="height:6px; background:#ddd; border-radius:3px; overflow:hidden;">
            <div id="hw-bar" style="width:0%; height:100%; background:#e74c3c; transition:width 0.5s ease;"></div>
            <div id="wx-hw-bar" style="width:0%; height:100%; background:#e74c3c; transition:width 0.5s ease;"></div>
        </div>
    </div>
    
    <div class="impact-meter">
        <div class="impact-label" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
            <span>Crosswind</span>
          
            <span id="wx-cw-val">--%</span>
        </div>
        <div class="meter-track" style="height:6px; background:#ddd; border-radius:3px; overflow:hidden;">
            <div id="cw-bar" style="width:0%; height:100%; background:#95a5a6; transition:width 0.5s ease;"></div>
            <div id="wx-cw-bar" style="width:0%; height:100%; background:#95a5a6; transition:width 0.5s ease;"></div>
        </div>
    </div>
</div>
        </div>
    `;
    document.getElementById('directions-tab').parentNode.appendChild(weatherTabContent);

    // --- INJECT FAVORITES TAB ---
    const favTabBtn = document.createElement('button');
    favTabBtn.className = 'tab-btn';
    favTabBtn.dataset.tab = 'favorites';
    favTabBtn.innerHTML = 'Favorites';
    favTabBtn.addEventListener('click', () => {
        switchTab('favorites');
        loadFavoritesList();
    });
    tabContainer.appendChild(favTabBtn);

    const favTabContent = document.createElement('div');
    favTabContent.id = 'favorites-tab';
    favTabContent.className = 'tab-content';
    favTabContent.innerHTML = `
        <div class="title-container"><h3>Favorite Locations</h3></div>
        <div id="favorites-list" class="favorites-list"></div>
    `;
    document.getElementById('directions-tab').parentNode.appendChild(favTabContent);

    // --- INJECT COLLAPSE BUTTON (Mobile) ---
    if (tabContainer) {
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'collapse-btn-mobile';
        collapseBtn.innerHTML = `<i data-feather="chevron-up"></i>`; // Show 'expand' icon initially
        collapseBtn.onclick = (e) => {
            e.stopPropagation();
            const sidebar = document.getElementById('sidebar');
            const isExpanded = sidebar.classList.toggle('expanded');

            // Correct icon: chevron-up when collapsed (pull up to expand), chevron-down when expanded (pull down to collapse)
            collapseBtn.innerHTML = isExpanded
                ? `<i data-feather="chevron-down"></i>`
                : `<i data-feather="chevron-up"></i>`;
            if (feather) feather.replace();

            // Dynamically adjust the control stack position
            const controlsStack = document.querySelector('.map-controls-stack');
            if (controlsStack) {
                if (isExpanded) {
                    controlsStack.style.bottom = 'calc(40vh + 20px)';
                } else {
                    controlsStack.style.bottom = 'calc(50px + 20px)';
                }
            }

            if (!isExpanded) {
                // Collapsed: deactivate tabs for clean state
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            } else {
                // Expanded: activate default tab if none active
                if (!document.querySelector('.tab-btn.active')) {
                    switchTab('plan');
                }
            }
        };
        tabContainer.appendChild(collapseBtn);
        if (feather) feather.replace();
    }

    // --- ROUTE PLANNING ---
    geocoders.push(createGeocoder('geocoder-start', 'Choose a starting point...', 0));
    geocoders.push(createGeocoder('geocoder-end', 'Choose a destination...', 1));

    // Create Actions Container for vertical stacking
    const startWrapper = document.querySelector('.location-input-wrapper');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'input-actions';
    
    // Add Star Button for Start
    const starBtnStart = document.createElement('button');
    starBtnStart.className = 'icon-btn star-btn';
    starBtnStart.innerHTML = `<i data-feather="star"></i>`;
    starBtnStart.title = "Save to Favorites";
    starBtnStart.onclick = (e) => toggleFavorite(0, e.currentTarget);
    actionsDiv.appendChild(starBtnStart);
    startWrapper.appendChild(actionsDiv);

    // Move existing locate-me-btn into the stack
    const locateBtn = startWrapper.querySelector('.locate-me-btn');
    if (locateBtn) actionsDiv.appendChild(locateBtn);

    // Add Reverse Button
    const reverseBtn = document.createElement('button');
    reverseBtn.className = 'icon-btn reverse-btn';
    reverseBtn.innerHTML = `<i data-feather="refresh-cw"></i>`;
    reverseBtn.title = "Reverse Route";
    reverseBtn.onclick = reverseRoute;
    actionsDiv.appendChild(reverseBtn);

    // Add Round Trip Button
    const roundTripBtn = document.createElement('button');
    roundTripBtn.className = 'icon-btn round-trip-btn';
    roundTripBtn.innerHTML = `<i data-feather="repeat"></i>`;
    roundTripBtn.title = "Round Trip";
    roundTripBtn.onclick = makeRoundTrip;
    actionsDiv.appendChild(roundTripBtn);

    // Add Actions for Destination (End)
    const endWrapper = document.querySelectorAll('.location-input-wrapper')[1];
    const endActionsDiv = document.createElement('div');
    endActionsDiv.className = 'input-actions';
    const starBtnEnd = document.createElement('button');
    starBtnEnd.className = 'icon-btn star-btn';
    starBtnEnd.innerHTML = `<i data-feather="star"></i>`;
    starBtnEnd.title = "Save to Favorites";
    starBtnEnd.onclick = (e) => toggleFavorite(1, e.currentTarget);
    endActionsDiv.appendChild(starBtnEnd);
    endWrapper.appendChild(endActionsDiv);

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
    compassBtn.title = "Toggle: North Up / Heading Up";
    controlsStack.appendChild(compassBtn);

    // Sync icon rotation with map bearing
    map.on('rotate', () => {
        const bearing = map.getBearing();
        compassBtn.style.transform = `rotate(${-bearing}deg)`;
    });

    compassBtn.addEventListener('click', () => {
        if (compassMode === 'north') {
            compassMode = 'heading';
            compassBtn.classList.add('active-heading');
            // Map will update bearing on next GPS update via handlePositionUpdate
        } else {
            compassMode = 'north';
            compassBtn.classList.remove('active-heading');
            map.easeTo({ bearing: 0, pitch: 0 });
        }
    });

    // --- TERRAIN TOGGLE ---
    const terrainBtn = document.createElement('button');
    terrainBtn.className = 'map-overlay-btn';
    terrainBtn.innerHTML = `<i data-feather="triangle"></i>`; // Mountain-ish icon
    terrainBtn.title = "Toggle 3D Terrain";
    terrainBtn.onclick = () => {
        isTerrainEnabled = !isTerrainEnabled;
        toggleTerrain(map, isTerrainEnabled);
        terrainBtn.classList.toggle('active', isTerrainEnabled);
    };
    //controlsStack.appendChild(terrainBtn);

    // --- MAP STYLE PICKER ---
    const styleBtnContainer = document.createElement('div');
    styleBtnContainer.style.position = 'relative';
    styleBtnContainer.style.pointerEvents = 'auto'; // Ensure clicks pass to children

    const styleBtn = document.createElement('button');
    styleBtn.className = 'map-overlay-btn';
    styleBtn.innerHTML = `<i data-feather="layers"></i>`;
    styleBtn.title = "Change Map Style";

    const styleMenu = document.createElement('div');
    styleMenu.className = 'style-picker-menu';
    styleMenu.innerHTML = `
        <div class="style-option" data-style="mapbox://styles/mapbox/streets-v12">Streets</div>
        <div class="style-option" data-style="mapbox://styles/mapbox/satellite-streets-v12">Satellite</div>
        <div class="style-option" data-style="mapbox://styles/mapbox/light-v11">Light</div>
        <div class="style-option" data-style="mapbox://styles/mapbox/dark-v11">Dark</div>
        <div class="style-option" data-style="mapbox://styles/mapbox/navigation-day-v1">Nav Day</div>
        <div class="style-option" data-style="mapbox://styles/mapbox/navigation-night-v1">Nav Night</div>
    `;

    styleBtn.onclick = (e) => {
        e.stopPropagation();
        styleMenu.classList.toggle('active');
    };

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!styleBtnContainer.contains(e.target)) styleMenu.classList.remove('active');
    });

    styleMenu.querySelectorAll('.style-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const newStyle = opt.dataset.style;
            if (newStyle !== currentMapStyle) {
                currentMapStyle = newStyle;
                map.setStyle(newStyle);
            }
            // User manually chose a style → enable auto-switch only if it's a navigation style
            usesNavigationStyle = newStyle.includes('navigation');
            styleMenu.classList.remove('active');
        });
    });

    styleBtnContainer.appendChild(styleMenu);
    styleBtnContainer.appendChild(styleBtn);
    //controlsStack.appendChild(styleBtnContainer);

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
            toggleWeather(map, true); // Enable Wind Layer
        } else {
            toggleWeather(map, false); // Hide all layers
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
    //controlsStack.appendChild(trafficBtn);

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

    // Recalculate Button (Dynamically Created)
    const recalcBtn = document.createElement('button');
    recalcBtn.id = 'recalc-btn';
    recalcBtn.className = 'map-overlay-btn';
    recalcBtn.style.display = 'none'; // Hidden until navigation starts
    recalcBtn.innerHTML = `<i data-feather="refresh-cw"></i>`;
    recalcBtn.title = "Recalculate Route";
    recalcBtn.onclick = manualReroute;
    controlsStack.appendChild(recalcBtn);

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

    // --- RESTORE LAYERS ON STYLE CHANGE ---
    map.on('style.load', () => {
        // 1. Restore Terrain if enabled
        if (isTerrainEnabled) toggleTerrain(map, true);

        // 2. Restore Route Line
        if (currentRouteData) {
            // We can re-use drawStaticRoute logic to re-add the source/layer
            drawStaticRoute(map, currentRouteData.geometry, !isNavigating);
        }

        // 3. Restore Weather Layers
        restoreWeather(map);

        // 3. Markers (DOM elements) persist automatically, but custom layers (Traffic/Weather) need re-toggling if active.
    });
});

function initRouteOptionsUI() {
    const existing = document.querySelector('.route-options-container');
    if (existing) existing.remove();

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'route-options-container';
    optionsDiv.innerHTML = `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:var(--text-secondary);" title="The cycling profile avoids motorways by default;">
            <input type="checkbox" id="avoid-highways" checked disabled> Avoid Highways
        </label>
        <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:var(--text-secondary);">
            <input type="checkbox" id="avoid-aroads"> Avoid A-Roads
        </label>
        <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:var(--text-secondary);">
            <input type="checkbox" id="prefer-cyclelanes"> Maximise Use of Cycle Lanes
        </label>
        <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:var(--text-secondary);">
            <input type="checkbox" id="prefer-scenic"> 🌳 Scenic Route (Parks & Greenways)
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

    // --- ROBUST WAY TO FIND THE ADD DESTINATION BUTTON ---
    const destList = document.getElementById('destination-list');
    let addDestBtn = document.getElementById('add-destination-btn');

    if (!addDestBtn) {
        // Fallback: search by visible text (matches "+ Add Destination" or "Add Destination")
        addDestBtn = Array.from(document.querySelectorAll('button')).find(btn => 
            btn.textContent.trim().includes('Add Destination')
        );
    }

    // --- ENFORCE LAYOUT: List -> Button -> Options ---
    if (destList && addDestBtn) {
        // Ensure button is immediately after the list (moves it if necessary)
        destList.after(addDestBtn);
        // Ensure options are immediately after the button
        addDestBtn.after(optionsDiv);
    } else if (destList) {
        // Fallback: just append options after list if button is missing
        destList.after(optionsDiv);
    }

    // Default time setup (unchanged)
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const timeInput = document.getElementById('route-time');
    if (timeInput) {
        timeInput.value = now.toISOString().slice(0, 16);
    }
}

function switchTab(tabId) {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    const clickedTabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const isAlreadyActive = clickedTabBtn.classList.contains('active');

    // Deactivate all first
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    if (isMobile) {
        // If we click the currently active tab and the panel is expanded, we should collapse it.
        if (isAlreadyActive && sidebar.classList.contains('expanded')) {
            sidebar.classList.remove('expanded');
            // By not re-adding the 'active' class, the tab is deselected and panel is collapsed.
        } else {
            // Otherwise, we expand the panel and show the new tab content.
            sidebar.classList.add('expanded');
            document.getElementById(`${tabId}-tab`).classList.add('active');
            clickedTabBtn.classList.add('active');
        }
    } else {
        // Desktop behavior remains simple: just switch the tab.
        document.getElementById(`${tabId}-tab`).classList.add('active');
        clickedTabBtn.classList.add('active');
    }
}

// Add or update the createGeocoder function (likely already exists in app.js – replace or merge with this version)
function createGeocoder(containerId, placeholder, index) {
    const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: placeholder,
        collapsed: false,
        clearOnBlur: false,
        marker: false, // We handle markers manually
        localGeocoder: searchLocal,
        localGeocoderOnly: false
    });

    // When a result is selected
    geocoder.on('result', async (e) => {
        addToHistory(e.result);
        currentFeatures[index] = e.result; // Store feature for favorites
        const coords = e.result.center; // [lng, lat]

        // Lock dropdown
        const wrapper = document.getElementById(containerId).closest('.location-input-wrapper');
        if (wrapper) wrapper.classList.add('location-set');

        // Update Star Button State
        const container = document.getElementById(containerId);
        if (container && container.parentElement) {
            const btn = container.parentElement.querySelector('.star-btn');
            if (btn) {
                const isFav = getFavorites().some(f => f.place_name === e.result.place_name);
                btn.classList.toggle('active', isFav);
                btn.innerHTML = isFav ? `<i data-feather="star" fill="currentColor"></i>` : `<i data-feather="star"></i>`;
                if (feather) feather.replace();
            }
        }

        waypoints[index] = coords;

        // Update markers immediately
        const validWaypoints = waypoints.filter(w => w);
        addRouteMarkers(map, validWaypoints, handleMarkerDrag);

        // Auto-calculate route if both start and end are set
        if (validWaypoints.length >= 2) {
            // Optional: add a small debounce to prevent rapid double-calls
            clearTimeout(window.autoRouteTimeout);
            window.autoRouteTimeout = setTimeout(async () => {
                // Show loading state (you can customize this)
                document.body.style.cursor = 'wait';
                const planBtn = document.getElementById('plan-route-btn');
                if (planBtn) planBtn.disabled = true;

                await calculateRoute(); // Your existing function that calls drawWindRoute, updates stats, elevation, wind impact, etc.

                document.body.style.cursor = 'default';
                if (planBtn) planBtn.disabled = false;
            }, 300);
        }
    });

    // When cleared
    geocoder.on('clear', () => {
        waypoints[index] = null;
        currentFeatures[index] = null;
        // Unlock dropdown
        const wrapper = document.getElementById(containerId).closest('.location-input-wrapper');
        if (wrapper) wrapper.classList.remove('location-set');

        const container = document.getElementById(containerId);
        if (container && container.parentElement) {
            const btn = container.parentElement.querySelector('.star-btn');
            if (btn) {
                btn.classList.remove('active');
                btn.innerHTML = `<i data-feather="star"></i>`;
                if (feather) feather.replace();
            }
        }
        const validWaypoints = waypoints.filter(w => w);
        addRouteMarkers(map, validWaypoints, handleMarkerDrag);

        if (validWaypoints.length < 2) {
            clearRoute(map);
            // Reset stats, elevation chart, wind meters, etc.
            // (call your existing reset functions here)
        }
    });

    // Unlock on typing
    if (geocoder._inputEl) {
        geocoder._inputEl.addEventListener('input', () => {
            const wrapper = document.getElementById(containerId).closest('.location-input-wrapper');
            if (wrapper) wrapper.classList.remove('location-set');
        });
    }

    // Append to DOM
    const container = document.getElementById(containerId);
    if (container) {
        container.appendChild(geocoder.onAdd(map));
    }

    return geocoder;
}

function addDestination() {
    const destinationList = document.getElementById('destination-list');
    const newIndex = waypoints.length;
    waypoints.push(null);
    currentFeatures.push(null);

    const wrapper = document.createElement('div');
    wrapper.className = 'location-input-wrapper';
    const container = document.createElement('div');
    container.className = 'geocoder-container';

    wrapper.appendChild(container);
    destinationList.appendChild(wrapper);

    // Add Actions (Star Button)
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'input-actions';
    const starBtn = document.createElement('button');
    starBtn.className = 'icon-btn star-btn';
    starBtn.innerHTML = `<i data-feather="star"></i>`;
    starBtn.title = "Save to Favorites";
    starBtn.onclick = (e) => toggleFavorite(newIndex, e.currentTarget);
    actionsDiv.appendChild(starBtn);
    wrapper.appendChild(actionsDiv);

    const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: `Choose destination #${newIndex}...`,
        marker: false,
        localGeocoder: searchLocal
    });

    container.appendChild(geocoder.onAdd(map));
    geocoders.push(geocoder);

    geocoder.on('result', (e) => {
        addToHistory(e.result);
        currentFeatures[newIndex] = e.result;

        wrapper.classList.add('location-set');
        
        const isFav = getFavorites().some(f => f.place_name === e.result.place_name);
        starBtn.classList.toggle('active', isFav);
        starBtn.innerHTML = isFav ? `<i data-feather="star" fill="currentColor"></i>` : `<i data-feather="star"></i>`;
        if (feather) feather.replace();

        waypoints[newIndex] = e.result.center;
        addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
    });
    geocoder.on('clear', () => { 
        waypoints[newIndex] = null; 
        currentFeatures[newIndex] = null;
        wrapper.classList.remove('location-set');
        starBtn.classList.remove('active');
        starBtn.innerHTML = `<i data-feather="star"></i>`;
        if (feather) feather.replace();
    });

    if (geocoder._inputEl) {
        geocoder._inputEl.addEventListener('input', () => wrapper.classList.remove('location-set'));
    }
    if (feather) feather.replace();
}

function insertIntermediateWaypoint(coords) {
    // 1. Determine insertion index (before the last destination)
    // If we only have Start(0) and End(1), we insert at 1.
    const insertIndex = waypoints.length - 1;
    
    // 2. Update Data Arrays
    waypoints.splice(insertIndex, 0, coords);
    currentFeatures.splice(insertIndex, 0, null); // Placeholder
    
    // 3. Update UI (Insert Input Field)
    const destinationList = document.getElementById('destination-list');
    const wrappers = destinationList.getElementsByClassName('location-input-wrapper');
    const lastWrapper = wrappers[wrappers.length - 1]; // The destination input
    
    const wrapper = document.createElement('div');
    wrapper.className = 'location-input-wrapper';
    const container = document.createElement('div');
    container.className = 'geocoder-container';
    wrapper.appendChild(container);
    
    // Insert before the final destination input
    destinationList.insertBefore(wrapper, lastWrapper);

    // Add Actions (Star Button)
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'input-actions';
    const starBtn = document.createElement('button');
    starBtn.className = 'icon-btn star-btn';
    starBtn.innerHTML = `<i data-feather="star"></i>`;
    starBtn.title = "Save to Favorites";
    starBtn.onclick = (e) => toggleFavorite(insertIndex, e.currentTarget);
    actionsDiv.appendChild(starBtn);
    wrapper.appendChild(actionsDiv);

    const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: `Via point...`,
        marker: false,
        localGeocoder: searchLocal
    });

    container.appendChild(geocoder.onAdd(map));
    
    // Sync Geocoder List
    geocoders.splice(insertIndex, 0, geocoder);

    // Save to history when used
    geocoder.on('result', (e) => {
        addToHistory(e.result);
        currentFeatures[insertIndex] = e.result;

        wrapper.classList.add('location-set');

        const isFav = getFavorites().some(f => f.place_name === e.result.place_name);
        starBtn.classList.toggle('active', isFav);
        starBtn.innerHTML = isFav ? `<i data-feather="star" fill="currentColor"></i>` : `<i data-feather="star"></i>`;
        if (feather) feather.replace();

        waypoints[insertIndex] = e.result.center;
        addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
        calculateRoute();
    });

    if (geocoder._inputEl) {
        geocoder._inputEl.addEventListener('input', () => wrapper.classList.remove('location-set'));
    }
    
    if (feather) feather.replace();

    // 4. Trigger Route Recalculation
    calculateRoute();
}

async function calculateRoute(options = {}) {
    const planBtn = document.getElementById('plan-btn');
    const originalContent = planBtn.innerHTML;

    try {
        const validWaypoints = waypoints.filter(w => w);
        if (validWaypoints.length < 2) {
            if (options.suppressAlerts) return;
            return alert("Please select at least a start and end point.");
        }

        // Auto-zoom to fit all waypoints (only if NOT navigating)
        if (!isNavigating) {
            const bounds = new mapboxgl.LngLatBounds();
            validWaypoints.forEach(pt => bounds.extend(pt));
            map.fitBounds(bounds, { padding: 100, maxZoom: 15 });
        }

        planBtn.disabled = true;
        planBtn.innerHTML = `<i data-feather="loader" class="spin-anim"></i> Planning...`;
        if (feather) feather.replace();

        // 1. Fetch Alternatives
        const routes = await fetchRouteAlternatives(validWaypoints, options);
        
        if (!routes || routes.length === 0) return;

        // PREPARE TERRAIN FOR BATCH ELEVATION CALCS
        // We enable terrain once here to avoid toggling it on/off for every route option
        const previousTerrain = map.getTerrain();
        let terrainResetNeeded = false;
        if (!previousTerrain || previousTerrain.exaggeration === 0) {
            map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1 });
            await new Promise(resolve => map.once('idle', resolve));
            terrainResetNeeded = true;
        }

        // 2. Get Preferences
        const avoidARoads = document.getElementById('avoid-aroads')?.checked || false;
        const preferScenic = document.getElementById('prefer-scenic')?.checked || false;
        
        // 3. Fetch Weather for Scoring (Start Point)
        const start = validWaypoints[0];
        const weather = await fetchWindAtLocation(start[1], start[0]);
        const windBearing = weather ? weather.bearing : 0;

        // 4. Score & Rank Routes
        const scoredRoutes = await Promise.all(routes.map(async (r, index) => {
            // Wind Score
            const windScore = calculateRouteWindScore(r.geometry, windBearing);
            
            // Detailed Road Analysis (Cycle Lanes, A-Roads, Motorways)
            const stats = analyzeRouteCharacteristics(r);
            
            // Elevation Gain (Async Calculation)
            const profile = await getElevationProfile(map, r.geometry);
            let ascent = 0;
            if (profile && profile.length > 0) {
                const elevs = profile.map(p => p.elevation);
                for(let i=1; i<elevs.length; i++) {
                    if(elevs[i] > elevs[i-1]) ascent += (elevs[i] - elevs[i-1]);
                }
            }

            // --- ADVANCED SCORING ALGORITHM ---
            let score = 50; // Base score
            
            // 1. WIND FACTOR (0-100 impact)
            // Tailwind is a huge plus, headwind is a major drag.
            score += (windScore.percentage - 50); // +/- 50 pts based on wind
            
            // 2. INFRASTRUCTURE (Cycle Lanes)
            // We want to maximize this.
            score += (stats.cycleLanePct * 0.5); // Up to +50 pts

            // 2b. SCENIC SCORE
            // If scenic is requested, heavily weight green areas
            if (preferScenic) score += (stats.scenicScore * 2);
            
            // 3. ROAD DANGER (A-Roads & Motorways)
            // Heavy penalty for A-roads.
            score -= (stats.aRoadPct * 1.5); 
            score -= (stats.motorwayPct * 5); // Huge penalty for motorways
            
            // 4. EFFORT (Ascent)
            // Penalize climbing: -1 pt per 10m climbed
            score -= (ascent / 10);

            // 5. EFFICIENCY (Time)
            const fastestDuration = Math.min(...routes.map(rt => rt.duration));
            const durationDiffMins = (r.duration - fastestDuration) / 60;
            score -= (durationDiffMins * 2); // -2 pts per minute slower

            // User Preferences
            if (avoidARoads && stats.aRoadPct > 5) score -= 50; // Strict penalty

            return { ...r, windScore, stats, ascent, score, originalIndex: index };
        }));

        // Restore Terrain State
        if (terrainResetNeeded) {
            if (previousTerrain) map.setTerrain(previousTerrain);
            else map.setTerrain(null);
        }

        // Sort by Score (Descending)
        scoredRoutes.sort((a, b) => b.score - a.score);

        if (scoredRoutes.length > 0) {
            switchTab('directions');
            handleRouteSelection(scoredRoutes[0], true, scoredRoutes);
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
    currentFeatures = [null, null];
    geocoders.forEach(g => g.clear());

    const destinationList = document.getElementById('destination-list');
    destinationList.innerHTML = `
        <div class="location-input-wrapper">
            <div id="geocoder-start" class="geocoder-container"></div>
            <div class="input-actions">
                <button class="icon-btn star-btn" title="Save to Favorites" onclick="toggleFavorite(0, this)"><i data-feather="star"></i></button>
                <button class="icon-btn locate-me-btn" title="Use current location"><i data-feather="crosshair"></i></button>
                <button class="icon-btn reverse-btn" title="Reverse Route" onclick="reverseRoute()">
                    <i data-feather="refresh-cw"></i>
                </button>
                <button class="icon-btn round-trip-btn" title="Round Trip">
                    <i data-feather="repeat"></i>
                </button>
            </div>
        </div>
        <div class="location-input-wrapper">
            <div id="geocoder-end" class="geocoder-container"></div>
            <div class="input-actions">
                <button class="icon-btn star-btn" title="Save to Favorites" onclick="toggleFavorite(1, this)"><i data-feather="star"></i></button>
            </div>
        </div>
    `;
    geocoders = [];
    geocoders.push(createGeocoder('geocoder-start', 'Choose a starting point...', 0));
    geocoders.push(createGeocoder('geocoder-end', 'Choose a destination...', 1));
    initRouteOptionsUI(); // Re-add options
    document.querySelector('.round-trip-btn').addEventListener('click', makeRoundTrip);
    document.querySelector('.locate-me-btn').addEventListener('click', locateUser);

    clearRoute(map);
    document.getElementById('clear-route-btn').style.display = 'none';
    const navBtn = document.getElementById('nav-btn');
    if (navBtn) navBtn.style.display = 'none';
    const recalcBtn = document.getElementById('recalc-btn');
    if (recalcBtn) recalcBtn.style.display = 'none';
    stopRouteAnimation();

    // Remove elevation chart if exists
    const chart = document.getElementById('elevation-container');
    if (chart) chart.remove();

    // Clear POIs
    poiMarkers.forEach(m => m.remove());
    poiMarkers = [];

    document.getElementById('save-btn').style.display = 'none';
    const mobileSaveBtn = document.getElementById('mobile-save-btn');
    if (mobileSaveBtn) mobileSaveBtn.remove();

    switchTab('plan');
}

function reverseRoute() {
    if (waypoints.length < 2) return;

    // 1. Swap Coordinates
    const tempCoords = waypoints[0];
    waypoints[0] = waypoints[1];
    waypoints[1] = tempCoords;
    
    const tempFeat = currentFeatures[0];
    currentFeatures[0] = currentFeatures[1];
    currentFeatures[1] = tempFeat;

    // 2. Swap Input Values (Visual)
    const inputStart = geocoders[0]._inputEl;
    const inputEnd = geocoders[1]._inputEl;
    const tempText = inputStart.value;

    // We set values directly to avoid triggering double searches
    inputStart.value = inputEnd.value;
    inputEnd.value = tempText;

    if (inputStart.value) inputStart.closest('.location-input-wrapper').classList.add('location-set');
    else inputStart.closest('.location-input-wrapper').classList.remove('location-set');
    if (inputEnd.value) inputEnd.closest('.location-input-wrapper').classList.add('location-set');
    else inputEnd.closest('.location-input-wrapper').classList.remove('location-set');

    // 3. Update Star Buttons
    const startBtn = document.querySelectorAll('.star-btn')[0];
    const endBtn = document.querySelectorAll('.star-btn')[1];
    
    const isStartFav = currentFeatures[0] && getFavorites().some(f => f.place_name === currentFeatures[0].place_name);
    const isEndFav = currentFeatures[1] && getFavorites().some(f => f.place_name === currentFeatures[1].place_name);
    
    if (startBtn) { startBtn.classList.toggle('active', isStartFav); startBtn.innerHTML = isStartFav ? `<i data-feather="star" fill="currentColor"></i>` : `<i data-feather="star"></i>`; }
    if (endBtn) { endBtn.classList.toggle('active', isEndFav); endBtn.innerHTML = isEndFav ? `<i data-feather="star" fill="currentColor"></i>` : `<i data-feather="star"></i>`; }
    
    if (feather) feather.replace();

    // 3. Recalculate if we have a route
    if (waypoints[0] && waypoints[1]) calculateRoute();
}

function makeRoundTrip() {
    if (!waypoints[0]) return alert("Please select a starting point first.");

    // Ensure we have at least 2 waypoints (Start + End)
    if (waypoints.length < 2) waypoints.push(null);

    // Set the last waypoint to be the same as the first
    const lastIndex = waypoints.length - 1;
    waypoints[lastIndex] = [...waypoints[0]]; // Copy coordinates

    // Update UI
    if (geocoders[0] && geocoders[lastIndex]) {
        const startInput = geocoders[0]._inputEl || document.querySelector('#geocoder-start input');
        if (startInput) geocoders[lastIndex].setInput(startInput.value);
        if (geocoders[lastIndex]._inputEl) {
            geocoders[lastIndex]._inputEl.closest('.location-input-wrapper').classList.add('location-set');
        }
    }

    addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
    calculateRoute();
}

async function handleRouteSelection(route, isNew = false, allOptions = null) {
    currentRouteData = route;
    document.getElementById('nav-btn').style.display = 'block';
    stopRouteAnimation(); // Stop any previous animation
    drawStaticRoute(map, route.geometry, !isNavigating); // Draw the selected route

    // Update live session with new route geometry if navigating (e.g. Reroute)
    if (isNavigating && liveSessionId) {
        updateLiveSession(liveSessionId, { coords: userLocation, routeGeometry: route.geometry });
    }

    if (isNew && currentUser) {
        document.getElementById('save-btn').style.display = 'block';

        // FIX: Add a visible Save button to the Directions tab for mobile users
        let mobileSaveBtn = document.getElementById('mobile-save-btn');
        if (!mobileSaveBtn) {
            mobileSaveBtn = document.createElement('button');
            mobileSaveBtn.id = 'mobile-save-btn';
            mobileSaveBtn.className = 'primary-btn';
            mobileSaveBtn.style.marginTop = '12px';
            mobileSaveBtn.style.backgroundColor = '#2ecc71'; // Green to stand out
            mobileSaveBtn.innerHTML = `<i data-feather="save"></i> Save to Cloud`;
            mobileSaveBtn.onclick = handleSaveButtonClick;
            
            // Insert after the stats container so it's easily accessible
            const stats = document.getElementById('stats-container');
            if (stats && stats.parentNode) {
                stats.parentNode.insertBefore(mobileSaveBtn, stats.nextSibling);
            }
        }
        mobileSaveBtn.style.display = 'flex';
    }

    // --- RENDER ROUTE OPTIONS (If available) ---
    const list = document.getElementById('directions-list');
    list.innerHTML = ''; // Clear previous

    if (allOptions && allOptions.length > 1) {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'route-options-list';
        optionsContainer.style.marginBottom = '16px';
        optionsContainer.style.display = 'flex'; // Keep flex
        optionsContainer.style.flexDirection = 'column'; // Vertical stack
        optionsContainer.style.gap = '12px';
        optionsContainer.style.paddingBottom = '8px';

        allOptions.forEach((opt, idx) => {
            const isSelected = opt === route;
            const btn = document.createElement('div');
            btn.className = `route-card ${isSelected ? 'selected' : ''}`;
            btn.style.cursor = 'pointer';
            
            const distKm = (opt.distance / 1000).toFixed(1);
            const timeMins = Math.round(opt.duration / 60);
            
            // Color Coding Helper
            const getScoreColor = (val, highIsGood = true) => {
                if (highIsGood) return val >= 70 ? '#2ecc71' : val >= 40 ? '#f39c12' : '#e74c3c';
                return val <= 10 ? '#2ecc71' : val <= 30 ? '#f39c12' : '#e74c3c';
            };

            const windColor = getScoreColor(opt.windScore.percentage, true);
            const cycleColor = getScoreColor(opt.stats.cycleLanePct, true);
            const roadColor = getScoreColor(opt.stats.aRoadPct, false);
            // Add Ascent Color (Green < 50m, Orange < 150m, Red > 150m)
            const ascentColor = opt.ascent < 50 ? '#2ecc71' : opt.ascent < 150 ? '#f39c12' : '#e74c3c';

            btn.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-weight:700; font-size:1rem; color:var(--text-primary);">${idx === 0 ? '★ Recommended' : `Option ${idx + 1}`}</span>
                    <span style="font-size:1rem; font-weight:700;">${timeMins} min</span>
                </div>
                <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">
                    ${distKm} km total distance
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:0.75rem; background:#f8f9fa; padding:8px; border-radius:8px;">
                    <div title="Wind Favorability" style="display:flex; align-items:center; gap:6px;">
                        <span style="width:8px; height:8px; border-radius:50%; background:${windColor};"></span>
                        <span>Wind ${opt.windScore.percentage}%</span>
                    </div>
                    <div title="Cycle Lane Coverage" style="display:flex; align-items:center; gap:6px;">
                        <span style="width:8px; height:8px; border-radius:50%; background:${cycleColor};"></span>
                        <span>Cycle ${opt.stats.cycleLanePct}%</span>
                    </div>
                    <div title="A-Road Exposure" style="display:flex; align-items:center; gap:6px;">
                        <span style="width:8px; height:8px; border-radius:50%; background:${roadColor};"></span>
                        <span>A-Road ${opt.stats.aRoadPct}%</span>
                    </div>
                    <div title="Total Ascent" style="display:flex; align-items:center; gap:6px;">
                        <span style="width:8px; height:8px; border-radius:50%; background:${ascentColor};"></span>
                        <span>Climb ${Math.round(opt.ascent)}m</span>
                    </div>
                </div>
            `;
            btn.onclick = () => handleRouteSelection(opt, false, allOptions);
            optionsContainer.appendChild(btn);
        });
        list.appendChild(optionsContainer);
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
    const tabContainer = document.querySelector('.tab-container');
    if (tabContainer && !document.getElementById('realtime-nav-btn')) {
        const navBtn = document.createElement('button');
        navBtn.id = 'realtime-nav-btn';
        navBtn.className = 'primary-btn nav-btn-large';
        navBtn.innerHTML = `<i data-feather="navigation"></i> Start Navigation`;
        navBtn.onclick = toggleNavigation;
        // Place it before the tabs container
        tabContainer.parentNode.insertBefore(navBtn, tabContainer);
    }

    // --- Update Time Stats ---
    const paceInput = document.getElementById('user-pace');
    const timeModeSelect = document.getElementById('time-mode');
    const routeTimeInput = document.getElementById('route-time');
    const startTime = new Date(routeTimeInput.value || new Date());

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

        let distStat = document.getElementById('dist-stat');
        if (!distStat) {
            distStat = document.createElement('div');
            distStat.className = 'stat-box';
            distStat.id = 'dist-stat';
            // Insert after timeStat
            if (timeStat.nextSibling) {
                stats.insertBefore(distStat, timeStat.nextSibling);
            } else {
                stats.appendChild(distStat);
            }
        }
        distStat.innerHTML = `<span class="label">Distance</span><div class="value">${distKm.toFixed(2)} km</div>`;

        // === NEW: Add placeholders for async stats (ascent & calories) ===
        if (!document.getElementById('elev-stat')) {
            const elevStat = document.createElement('div');
            elevStat.className = 'stat-box';
            elevStat.id = 'elev-stat';
            elevStat.innerHTML = `<span class="label">Ascent</span><div class="value" id="elev-val">-- m</div>`;
            stats.appendChild(elevStat);
        }

        if (!document.getElementById('cal-stat')) {
            const calStat = document.createElement('div');
            calStat.className = 'stat-box';
            calStat.id = 'cal-stat';
            calStat.innerHTML = `<span class="label">Est. Burn</span><div class="value" id="cal-val">--</div>`;
            stats.appendChild(calStat);
        }

        // === NEW: Set 4-column grid immediately (layout is now stable) ===
        stats.style.gridTemplateColumns = '1fr 1fr 1fr 1fr';
    };

    paceInput.onchange = updateTimeStats;
    timeModeSelect.onchange = updateTimeStats;
    routeTimeInput.onchange = updateTimeStats;
    updateTimeStats(); // Initial call

    const coords = route.geometry.coordinates; // [lng, lat]
    const weather = await fetchWindAtLocation(coords[0][1], coords[0][0]);
    if (weather) {
        const score = calculateRouteWindScore(route.geometry, weather.bearing);
        updateSidebarUI(score, weather);
        // The more detailed wind impact is calculated later by computeRouteWindImpact
        updateSidebarUI(null, weather);
    } else {
        console.warn("Weather fetch failed, wind stats will remain empty.");
    }

    // --- GENERATE 15-MIN INTERVAL FORECAST ---
    const paceKmH = parseFloat(paceInput.value) || 20;
    const totalDistKm = currentRouteData.distance / 1000;
    const totalDurationHours = totalDistKm / paceKmH;

    // Calculate points every 15 mins (0.25 hours)
    const forecastPoints = [];
    const line = turf.lineString(coords);

    // Start at 0, increment by 15 mins
    for (let t = 0; t <= totalDurationHours; t += 0.25) {
        const dist = t * paceKmH;
        if (dist > totalDistKm) break;

        const point = turf.along(line, dist, { units: 'kilometers' });
        const [lng, lat] = point.geometry.coordinates;

        // Calculate timestamp for this point
        const pointTime = new Date(startTime.getTime() + (t * 60 * 60 * 1000));

        forecastPoints.push({ lat, lon: lng, time: pointTime });
    }

    // Add end point if not close to last interval
    if (forecastPoints.length > 0) {
        const lastPt = forecastPoints[forecastPoints.length - 1];
        const endTime = new Date(startTime.getTime() + (totalDurationHours * 60 * 60 * 1000));
        // If last point is more than 5 mins away from end
        if ((endTime - lastPt.time) > 5 * 60 * 1000) {
            const endCoord = coords[coords.length - 1];
            forecastPoints.push({ lat: endCoord[1], lon: endCoord[0], time: endTime });
        }
    }

    // Fetch and Render
    renderForecast(forecastPoints);

    // Generate and Draw Elevation Profile
    // Show loading state first while waiting for terrain data
    // In handleRouteSelection(route, isNew = false) — Replace the entire elevation block with this updated version

    // --- Generate and Draw Elevation Profile ---
    // In handleRouteSelection(route, isNew = false) — Replace the entire elevation block with this robust version

    // --- Generate and Draw Elevation Profile ---
    let elevContainer = document.getElementById('elevation-container');
    if (!elevContainer) {
        elevContainer = document.createElement('div');
        elevContainer.id = 'elevation-container';
        const statsContainer = document.getElementById('stats-container');
        statsContainer.parentNode.insertBefore(elevContainer, statsContainer.nextSibling);
    }

    // Show loading spinner initially
    elevContainer.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px;">
        <div class="spin-anim" style="width:24px; height:24px; border:3px solid #e0e0e0; border-top-color:var(--accent-blue); border-radius:50%;"></div>
        <span style="margin-top:10px; font-size:0.9rem; color:var(--text-secondary);">Calculating elevation...</span>
    </div>
`;

    const updateElevation = async () => {
        const elevationData = await getElevationProfile(map, route.geometry);

        const allZero = elevationData.every(d => d.elevation === 0);
        if (elevationData.length < 2 || allZero) {
            elevContainer.innerHTML = '<p class="empty-state">No elevation data available for this route.<br><small>Try zooming in or enabling 3D terrain.</small></p>';

            // Still update stats with fallback values
            if (document.getElementById('elev-val')) document.getElementById('elev-val').innerText = '0 m';
            const distKm = currentRouteData.distance / 1000;
            const fallbackCalories = Math.round(distKm * 25);
            if (document.getElementById('cal-val')) document.getElementById('cal-val').innerText = `${fallbackCalories} kcal`;
            return;
        }

        // --- Ascent (total positive gain) ---
        let cumulativeGain = 0;
        const elevations = elevationData.map(d => d.elevation);
        for (let i = 1; i < elevations.length; i++) {
            if (elevations[i] > elevations[i - 1]) {
                cumulativeGain += (elevations[i] - elevations[i - 1]);
            }
        }

        // --- Calories ---
        const distKm = currentRouteData.distance / 1000;
        const calories = Math.round((distKm * 25) + (cumulativeGain * 1.5));

        // Update async stat values (no layout change)
        if (document.getElementById('elev-val')) {
            document.getElementById('elev-val').innerText = `+${Math.round(cumulativeGain)} m`;
        }
        if (document.getElementById('cal-val')) {
            document.getElementById('cal-val').innerText = `${calories} kcal`;
        }

        renderElevationChart(elevationData, cumulativeGain); // pass ascent if you want to use it in chart
    };

    // Critical fix: Always wait for 'idle' after the route fitBounds animation completes.
    // If the map is already idle (e.g. loading a saved route), this fires immediately.
    map.once('idle', updateElevation);

    // --- Route Wind Impact (Detailed Meters) ---
    computeRouteWindImpact(route.geometry).then(impact => {
        updateWindImpactMeters(impact);
    });
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
        lastWeatherFetchDist = 0; // Reset weather fetch tracker

        playRouteAnimation(map, coords, realDurationMs, speed, (progress) => {
            updateWeatherForProgress(progress, realDurationHours);

            // Dynamic Weather Update (Throttled)
            const currentDistKm = (currentRouteData.distance / 1000) * progress;
            if (Math.abs(currentDistKm - lastWeatherFetchDist) > WEATHER_FETCH_INTERVAL_KM) {
                lastWeatherFetchDist = currentDistKm;

                // Calculate current position along route
                const line = turf.lineString(coords);
                const point = turf.along(line, currentDistKm); // units default to km in turf if not specified? turf.along takes (line, distance, options). Default units kilometers.
                const [lng, lat] = point.geometry.coordinates;

                // Fetch and update
                fetchWindAtLocation(lat, lng).then(weather => {
                    if (weather) updateSidebarUI(null, weather); // Pass null for score to only update conditions
                });
            }
        });
    };

    // Allow speed adjustment midway
    document.getElementById('anim-speed').oninput = (e) => {
        setAnimationSpeed(parseFloat(e.target.value));
    };


    if (feather) feather.replace();

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

        xhr.onload = function () {
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

        xhr.onerror = function () {
            console.error("CORS block or Network failure on radar frame.");
        };

        xhr.send();
    }
}

async function renderForecast(points) {
    const container = document.getElementById('wx-forecast-container');
    if (!container) return;

    container.innerHTML = `<div class="spin-anim" style="margin:20px auto; width:20px; height:20px; border:2px solid #ccc; border-top-color:#333; border-radius:50%;"></div>`;

    const forecasts = await fetchRouteForecast(points);

    container.innerHTML = '';
    if (forecasts.length === 0) {
        container.innerHTML = '<p style="font-size:0.8rem; color:#888; text-align:center;">Forecast unavailable</p>';
        return;
    }

    forecasts.forEach(wx => {
        const timeStr = new Date(wx.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <div class="fc-time">${timeStr}</div>
            <img src="src/Aeris_WxIcons_55x55/${wx.icon}" alt="${wx.desc}">
            <div class="fc-temp">${Math.round(wx.temp)}°</div>
            <div class="fc-wind">
                <i data-feather="wind" style="width:12px; height:12px;"></i> ${Math.round(wx.speed)}
            </div>
        `;
        container.appendChild(card);
    });
    if (feather) feather.replace();
}

const updateSidebarUI = (score, weather) => {
    // Update Weather Tab Conditions
    if (weather) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setVal('wx-temp-val', Math.round(weather.temp));
        setVal('wx-feels', Math.round(weather.feelsLike));
        setVal('wx-desc', weather.desc);
        setVal('wx-gust', weather.gust);
        setVal('wx-humidity', weather.humidity);

        const iconImg = document.getElementById('wx-icon');
        if (iconImg) {
            iconImg.src = `src/Aeris_WxIcons_55x55/${weather.icon}`; // Use local folder
            iconImg.style.display = 'block';
        }
    }
    // Legacy score update removed to prevent crashes on missing IDs.
    // Wind scores are now handled exclusively by updateWindImpactMeters
    // to avoid conflicting logic.
};

const loadSavedList = async () => {
    if (!currentUser) return;
    const list = document.getElementById('saved-routes-list');
    if (!list) return; // Fix: Prevent crash if element doesn't exist
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
            <small>Distance: ${(r.distance / 1000).toFixed(2)} km</small>
        `;

        // Action Buttons Container
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '4px';

        // Rename Button
        const renameBtn = document.createElement('button');
        renameBtn.className = 'delete-route-btn'; // Reuse style
        renameBtn.style.color = 'var(--text-secondary)';
        renameBtn.innerHTML = '<i data-feather="edit-2"></i>';
        renameBtn.title = "Rename Route";
        renameBtn.onclick = async (e) => {
            e.stopPropagation();
            const newName = prompt("Enter new name:", r.name);
            if (newName && newName !== r.name) {
                await updateRouteName(r.id, newName);
                loadSavedList();
            }
        };

        // Duplicate Button
        const dupBtn = document.createElement('button');
        dupBtn.className = 'delete-route-btn'; // Reuse style
        dupBtn.style.color = 'var(--accent-blue)';
        dupBtn.innerHTML = '<i data-feather="copy"></i>';
        dupBtn.title = "Duplicate Route";
        dupBtn.onclick = async (e) => {
            e.stopPropagation();
            const { id, ...routeData } = r; // Remove ID
            await saveRouteToCloud({ ...routeData, name: `${r.name} (Copy)` });
            loadSavedList();
        };

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
        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(dupBtn);
        actionsDiv.appendChild(delBtn);
        div.appendChild(actionsDiv);

        div.onclick = async () => {
            // FIX: Load EXACT route if available, otherwise fallback to recalculation
            if (r.legs && r.savedWaypoints) {
                // 1. Restore Route Object
                const routeObj = {
                    geometry: JSON.parse(r.geometry),
                    distance: r.distance,
                    duration: r.duration || 0,
                    legs: JSON.parse(r.legs),
                    weight_name: 'saved',
                    weight: 0
                };

                // 2. Restore Waypoints & Markers
                waypoints = JSON.parse(r.savedWaypoints);
                addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
                
                // 3. Update UI Inputs (Generic labels since we don't save address text)
                geocoders.forEach(g => g.clear());
                waypoints.forEach((wp, i) => {
                    if (geocoders[i]) geocoders[i].setInput(i === 0 ? "Saved Start" : i === waypoints.length - 1 ? "Saved Dest" : "Saved Stop");
                    if (geocoders[i] && geocoders[i]._inputEl) {
                        geocoders[i]._inputEl.closest('.location-input-wrapper').classList.add('location-set');
                    }
                });

                switchTab('directions');
                handleRouteSelection(routeObj, false);
            } else {
                // Legacy: Recalculate based on geometry
                const geo = JSON.parse(r.geometry);
                const routeWaypoints = [geo.coordinates[0], geo.coordinates[geo.coordinates.length - 1]];
                
                // FIX: Update global waypoints so sharing works for legacy routes
                waypoints = routeWaypoints;

                const freshRoutes = await fetchRouteAlternatives(routeWaypoints);
                if (freshRoutes && freshRoutes.length > 0) {
                    switchTab('directions');
                    handleRouteSelection(freshRoutes[0], false);
                }
            }
        };
        list.appendChild(div);
    });
};

function locateUser() {
    if (!navigator.geolocation) return alert("Geolocation not supported.");

    if (geocoders[0]) geocoders[0].setInput("Locating...");

    const onLocationFound = async (position) => {
        const { longitude, latitude } = position.coords;
        userLocation = [longitude, latitude]; // Update global state
        waypoints[0] = [longitude, latitude];

        const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}`);
        const data = await response.json();
        const address = data.features[0]?.place_name || "Current Location";

        geocoders[0].setInput(address);
        if (geocoders[0]._inputEl) {
            geocoders[0]._inputEl.closest('.location-input-wrapper').classList.add('location-set');
        }
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

    // Get location names for default title
    const startInput = document.querySelector('#geocoder-start input');
    const endInput = document.querySelector('#geocoder-end input');
    const startName = startInput ? startInput.value : "Start";
    const endName = endInput ? endInput.value : "Destination";

    const routeName = prompt("Enter a name for this route:", `${startName} to ${endName}`);
    if (!routeName) return;

    const start = currentRouteData.geometry.coordinates[0];
    const weather = await fetchWindAtLocation(start[1], start[0]);
    const score = calculateRouteWindScore(currentRouteData.geometry, weather?.bearing || 0);

    // OPTIMIZATION: Compress legs to avoid Firestore 1MB limit
    const compressedLegs = compressRouteLegs(currentRouteData.legs);

    // FIX: Save full route details to ensure exact reload
    const data = {
        userId: currentUser.uid,
        name: routeName,
        geometry: JSON.stringify(currentRouteData.geometry),
        distance: currentRouteData.distance,
        duration: currentRouteData.duration,
        legs: JSON.stringify(compressedLegs), // Save compressed turn-by-turn info
        savedWaypoints: JSON.stringify(waypoints),   // Save exact stops
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

                // Force start navigation/tracking if not already - REMOVED per user request
                // if (!isNavigating) toggleNavigation();
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
    if (!currentUser) {
        const sidebar = document.getElementById('sidebar');
        sidebar.innerHTML = `
            <div class="panel-content">
                <div class="title-container"><h1>📡 Live Tracking</h1></div>
                <div class="empty-state">
                    <p>Please log in to view this live session.</p>
                    <button id="track-login-btn" class="primary-btn" style="margin-top:16px;">
                        <i data-feather="log-in"></i> Login with Google
                    </button>
                </div>
            </div>
        `;
        if (feather) feather.replace();
        document.getElementById('track-login-btn').addEventListener('click', () => signInWithPopup(auth, googleProvider));
        return;
    }

    // Replace Sidebar Content with Tracking UI
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="panel-content">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="title-container"><h1>📡 Live Tracking</h1></div>
                <div style="display:flex; gap:8px;">
                    <button id="viewer-chat-icon-btn" class="collapse-btn-mobile" style="color:var(--accent-blue);" title="Open Chat"><i data-feather="message-circle"></i></button>
                    <button id="track-collapse-btn" class="collapse-btn-mobile"><i data-feather="chevron-up"></i></button>
                </div>
            </div>
            <div class="stat-box" style="margin-top:20px; text-align:center;">
                <p>Tracking user location...</p>
                <div id="last-update" style="font-size:0.8em; color:#888; margin-top:8px;">Waiting for signal...</div>
            </div>
            <div class="stat-box" style="margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; text-align:center;">
                <div>
                    <div style="font-size:0.8em; color:#888;">ETA</div>
                    <div id="track-eta" style="font-weight:bold; font-size:1.2em;">--:--</div>
                </div>
                <div>
                    <div style="font-size:0.8em; color:#888;">Remaining</div>
                    <div id="track-dist" style="font-weight:bold; font-size:1.2em;">-- km</div>
                </div>
            </div>
            <div class="stat-box" style="margin-top:10px; text-align:center; display:none;" id="status-box">
                <div style="font-size:0.8em; color:#888;">Status Update</div>
                <div id="track-status" style="font-weight:bold; font-size:1.1em; color:#9b59b6;">--</div>
            </div>
            <div style="margin-top:20px; text-align:center;">
                <p style="font-size:0.8em; color:#888; margin-bottom:8px;">Send Reaction</p>
                <div style="display:flex; justify-content:center; gap:15px;">
                    <button class="reaction-btn" data-emoji="👏" style="font-size:1.5rem; background:none; border:none; cursor:pointer; transition:transform 0.1s;">👏</button>
                    <button class="reaction-btn" data-emoji="🔥" style="font-size:1.5rem; background:none; border:none; cursor:pointer; transition:transform 0.1s;">🔥</button>
                    <button class="reaction-btn" data-emoji="❤️" style="font-size:1.5rem; background:none; border:none; cursor:pointer; transition:transform 0.1s;">❤️</button>
                    <button class="reaction-btn" data-emoji="🚴" style="font-size:1.5rem; background:none; border:none; cursor:pointer; transition:transform 0.1s;">🚴</button>
                </div>
                <button id="viewer-chat-btn" class="secondary-btn" style="margin-top:15px;">
                    <i data-feather="message-square"></i> Open Chat
                </button>
            </div>
            <button class="secondary-btn" onclick="window.location.href='/'" style="margin-top:20px;">
                <i data-feather="map"></i> Go to Route Planner
            </button>
        </div>
    `;
    if (feather) feather.replace();

    // NEW: Collapse Logic for Tracking Mode (Fixes hidden chat button on mobile)
    const collapseBtn = document.getElementById('track-collapse-btn');
    if (collapseBtn) {
        collapseBtn.onclick = () => {
            const isExpanded = sidebar.classList.toggle('expanded');
            collapseBtn.innerHTML = isExpanded ? `<i data-feather="chevron-down"></i>` : `<i data-feather="chevron-up"></i>`;
            if (feather) feather.replace();
        };
    }

    // Attach Reaction Listeners
    document.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.onclick = () => {
            btn.style.transform = 'scale(1.3)';
            setTimeout(() => btn.style.transform = 'scale(1)', 150);
            sendReaction(sessionId, btn.dataset.emoji);
        };
    });

    // Viewer Chat
    const viewerId = currentUser.uid;
    const viewerName = currentUser.name || `User ${viewerId.substr(0, 4)}`;
    registerViewer(sessionId, viewerId, viewerName);

    const openChat = () => showChatModal(sessionId, viewerName, false);
    document.getElementById('viewer-chat-btn').onclick = openChat;
    document.getElementById('viewer-chat-icon-btn').onclick = openChat;

    let lastRouteGeoStr = null;

    // Increment viewer count on join
    updateViewerCount(sessionId, 1);
    // Decrement on leave (best effort)
    window.addEventListener('unload', () => updateViewerCount(sessionId, -1));

    subscribeToLiveSession(sessionId, (data) => {
        if (data && data.bannedViewers && data.bannedViewers.includes(viewerId)) {
            alert("You have been removed from this session.");
            window.location.href = '/';
            return;
        }

        if (data) {
            // Draw Route if available (and update if changed)
            if (data.routeGeometry) {
                const geoStr = typeof data.routeGeometry === 'string' ? data.routeGeometry : JSON.stringify(data.routeGeometry);
                if (geoStr !== lastRouteGeoStr) {
                    lastRouteGeoStr = geoStr;
                    try {
                        const geo = JSON.parse(geoStr);
                        drawStaticRoute(map, geo, false); // Don't auto-fit on updates to keep focus on user
                    } catch (e) { console.error("Error parsing route geometry", e); }
                }
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

            // Update ETA and Distance
            if (data.eta) {
                const etaDate = data.eta.toDate ? data.eta.toDate() : new Date(data.eta);
                document.getElementById('track-eta').innerText = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            if (data.distanceRemaining) {
                document.getElementById('track-dist').innerText = data.distanceRemaining.toFixed(1) + ' km';
            }
            if (data.statusMessage) {
                const statusBox = document.getElementById('status-box');
                if (statusBox) {
                    statusBox.style.display = 'block';
                    document.getElementById('track-status').innerText = data.statusMessage;
                }
            }
            if (data.active === false) {
                document.getElementById('last-update').innerText = 'Session Ended';
            }
        }
    });
}

// --- NAVIGATION ---
function toggleNavigation() {
    // Fix: Check UI state to determine intent (Exit vs Enter)
    // This prevents getting stuck if isNavigating becomes false due to errors while UI is still in nav-mode
    const isCurrentlyInNavMode = document.body.classList.contains('nav-mode');

    // Resume if paused (minimized)
    if (isNavigating && !isCurrentlyInNavMode) {
        document.body.classList.add('nav-mode');
        initNavigationOverlays();
        const btn = document.getElementById('realtime-nav-btn');
        if (btn) btn.innerHTML = `<i data-feather="navigation"></i> Stop Navigation`;
        return;
    }

    // Toggle State based on current UI
    isNavigating = !isCurrentlyInNavMode;

    document.getElementById('nav-btn').classList.toggle('active', isNavigating);

    const recalcBtn = document.getElementById('recalc-btn');
    if (recalcBtn) recalcBtn.style.display = isNavigating ? 'flex' : 'none';

    // Toggle Navigation Mode UI (Fullscreen style)
    document.body.classList.toggle('nav-mode', isNavigating);
    if (isNavigating) {
        initNavigationOverlays();
    }

    if (isNavigating) startLiveTracking();
    else stopLiveTracking();
}

function startLiveTracking() {
    if (!navigator.geolocation) return alert("Geolocation not supported");

    speak("Starting navigation.");
    isNavigating = true;

    // --- AUTO SHARE LIVE LOCATION ---
    if (currentUser) {
        const handleAutoShare = async (pos) => {
            try {
                if (!liveSessionId) {
                    const coords = [pos.coords.longitude, pos.coords.latitude];
                    const routeGeo = currentRouteData ? currentRouteData.geometry : null;
                    liveSessionId = await createLiveSession(currentUser.uid, coords, routeGeo);
                    subscribeToReactions(liveSessionId); // Listen for viewer reactions

                    // Reveal Host UI immediately
                    const stopBtn = document.getElementById('stop-share-btn');
                    const statusBtn = document.getElementById('send-status-btn');
                    const dashBtn = document.getElementById('host-dash-btn');
                    const viewerCount = document.getElementById('nav-viewer-count');
                const shareBtn = document.getElementById('share-nav-btn');

                    if (stopBtn) stopBtn.style.display = 'block';
                    if (statusBtn) statusBtn.style.display = 'block';
                    // dashBtn (Live Chat) remains hidden until paused
                    if (viewerCount) viewerCount.style.display = 'flex';
                if (shareBtn) shareBtn.style.display = 'block';

                    // Start Subscriptions for Overlays
                    if (chatOverlayUnsubscribe) chatOverlayUnsubscribe();
                    chatOverlayUnsubscribe = subscribeToChat(liveSessionId, updateChatOverlay);
                    if (viewerOverlayUnsubscribe) viewerOverlayUnsubscribe();
                    viewerOverlayUnsubscribe = subscribeToViewers(liveSessionId, updateViewerOverlay);
                }
                const url = `${window.location.origin}${window.location.pathname}?track=${liveSessionId}`;
                showAutoShareModal(url);
            } catch (e) {
                console.error("Auto-share error:", e);
            }
        };

        // Get current position for session creation
        navigator.geolocation.getCurrentPosition(handleAutoShare, (err) => console.warn("Share loc error", err), GEO_OPTIONS);
    }

    // Check if user is near the start point
    const checkProximity = (pos) => {
        const userPos = [pos.coords.longitude, pos.coords.latitude];
        if (currentRouteData) {
            const startPoint = currentRouteData.geometry.coordinates[0];
            const distKm = turf.distance(userPos, startPoint, { units: 'kilometers' });

            if (distKm > 0.2) { // User is > 200m away from start
                speak("Rerouting from current location...");
                waypoints[0] = userPos;

                // Fix: Ensure destination is preserved if global waypoints are empty (e.g. loaded from saved route)
                if (!waypoints[1] && currentRouteData) {
                    const coords = currentRouteData.geometry.coordinates;
                    waypoints[1] = coords[coords.length - 1];
                }

                if (geocoders[0]) geocoders[0].setInput("Current Location");
                calculateRoute();
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
        handlePositionUpdate([pos.coords.longitude, pos.coords.latitude], pos.coords.heading, pos.coords.speed);
    }, err => {
        console.warn("Watch Position Error:", err);
        // Stop watching if permission is denied or insecure origin to prevent loop
        if (err.code === 1) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;

            if (err.message.includes("secure origin")) {
                console.warn("⚠️ Secure Origin Error. Starting Mock Navigation Loop.");
                // Start Mock Loop (Simulate standing still or moving slowly)
                if (mockIntervalId) clearInterval(mockIntervalId);
                mockIntervalId = setInterval(() => {
                    // Mock location: London or last known
                    const mockPos = userLocation || [-0.1276, 51.5072];
                    handlePositionUpdate(mockPos, 0, 5); // 5 m/s speed
                }, 2000);
            } else {
                isNavigating = false;
                alert("Live Navigation stopped: Permission denied.");
            }
        }
    }, GEO_OPTIONS);
}

function subscribeToReactions(sessionId) {
    if (liveSessionUnsubscribe) liveSessionUnsubscribe();
    lastReactionTime = Date.now(); // Ignore old reactions

    liveSessionUnsubscribe = subscribeToLiveSession(sessionId, (data) => {
        if (data && data.lastReaction) {
            // Handle Firestore Timestamp or Date object
            const ts = data.lastReaction.timestamp.toMillis ? data.lastReaction.timestamp.toMillis() : new Date(data.lastReaction.timestamp).getTime();
            if (ts > lastReactionTime) {
                lastReactionTime = ts;
                showReactionToast(data.lastReaction.emoji);
            }
        }

        // Update Viewer Count UI
        if (data && data.viewerCount !== undefined) {
            const countEl = document.getElementById('nav-viewer-count');
            const valEl = document.getElementById('viewer-count-val');
            if (countEl && valEl) {
                countEl.style.display = 'flex'; // Always show if session is active
                valEl.innerText = data.viewerCount;
            }
        }
    });
}

function manualReroute() {
    if (!navigator.geolocation) return alert("Geolocation not supported");

    speak("Rerouting...");

    // Show loading in Nav UI
    if (document.body.classList.contains('nav-mode')) {
        document.getElementById('nav-instr').innerHTML = `<i data-feather="loader" class="spin-anim"></i> Rerouting...`;
        if (feather) feather.replace();
    }

    const onLocationFound = (pos) => {
        const userPos = [pos.coords.longitude, pos.coords.latitude];
        waypoints[0] = userPos;

        // Ensure destination exists
        if (!waypoints[1] && currentRouteData) {
            const coords = currentRouteData.geometry.coordinates;
            waypoints[1] = coords[coords.length - 1];
        }

        if (geocoders[0]) geocoders[0].setInput("Current Location");
        calculateRoute();
    };

    navigator.geolocation.getCurrentPosition(onLocationFound, err => {
        console.warn("Reroute location error:", err);
        if (err.code === 1) {
            if (err.message.includes("secure origin")) {
                console.warn("⚠️ Secure Origin Error. Bypassing with Mock Location.");
                onLocationFound({ coords: { longitude: -0.1276, latitude: 51.5072 } });
                return;
            }
            alert("Location permission denied.");
        } else {
            alert("Could not get location for reroute.");
        }
    }, GEO_OPTIONS);
}

function handlePositionUpdate(userPos, heading, speed) {
    lastKnownHeading = heading;

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
        updateLiveSession(liveSessionId, { coords: userPos });
    }

    // Follow user if navigating OR if Compass Mode is 'heading' (even when not navigating)
    if (isNavigating || compassMode === 'heading') {
        const cameraOptions = { center: userPos, zoom: 18, pitch: 50 };
        if (compassMode === 'heading' && heading !== null && heading !== undefined) {
            cameraOptions.bearing = heading; // Rotate map to match device movement
        }
        map.easeTo(cameraOptions);
    }

    // --- OFF-ROUTE DETECTION & REROUTING ---
    // Track history for bearing calculation (Trend)
    const now = Date.now();
    recentLocations.push({ coords: userPos, timestamp: now });
    // Keep last 10s of history
    recentLocations = recentLocations.filter(l => now - l.timestamp < 10000);

    if (isNavigating && currentRouteData && !isRerouting) {
        const routeLine = turf.lineString(currentRouteData.geometry.coordinates);
        const pt = turf.point(userPos);
        // Check distance to route line
        const dist = turf.pointToLineDistance(pt, routeLine, { units: 'kilometers' });
        
        if (dist > 0.05) { // > 50 meters off-track
            console.log(`Off-route detected (${(dist*1000).toFixed(0)}m). Rerouting...`);
            performAutomaticReroute(userPos);
        }
    }

    // --- WRONG WAY DETECTION ---
    // Only check if moving faster than 1.5 m/s (~5.4 km/h) to avoid noise when stopped
    if (isNavigating && currentRouteData && heading !== null && speed > 1.5) {
        const routeLine = turf.lineString(currentRouteData.geometry.coordinates);
        const pt = turf.point(userPos);
        const snapped = turf.nearestPointOnLine(routeLine, pt);
        const distAlong = snapped.properties.location; // km
        const lineLength = turf.length(routeLine);

        // Look ahead 20m (0.02km) to determine route direction
        if (distAlong + 0.02 < lineLength) {
            const pointAhead = turf.along(routeLine, distAlong + 0.02);
            const routeBearing = turf.bearing(snapped, pointAhead);
            const normRouteBearing = (routeBearing + 360) % 360;
            
            let diff = Math.abs(heading - normRouteBearing);
            if (diff > 180) diff = 360 - diff;
            
            if (diff > 120) { // > 120 degrees difference implies moving backwards
                if (!wrongWayState.active) {
                    wrongWayState.active = true;
                    wrongWayState.startTime = Date.now();
                } else if (Date.now() - wrongWayState.startTime > 3000 && !wrongWayState.isAlerting) {
                     showWrongWayAlert();
                }
            } else {
                if (wrongWayState.isAlerting) hideWrongWayAlert();
            }
        }
    }

    // --- AUTO THEME SWITCHING (Nav Mode) ---
    if (isNavigating) {
        const hour = new Date().getHours();
        const isNight = hour < 6 || hour >= 18;

        // Simple Tunnel Detection: Check instruction text
        let isTunnel = false;
        const currentStepIdx = lastSpokenStepIndex + 1;
        if (currentRouteData && currentRouteData.legs && currentRouteData.legs[0].steps[currentStepIdx]) {
            const step = currentRouteData.legs[0].steps[currentStepIdx];
            const instr = step.maneuver.instruction.toLowerCase();
            const name = (step.name || "").toLowerCase();
            if (instr.includes('tunnel') || name.includes('tunnel')) isTunnel = true;
        }

        const targetStyle = (isNight || isTunnel) ? 'mapbox://styles/mapbox/navigation-night-v1' : 'mapbox://styles/mapbox/navigation-day-v1';

        if (currentMapStyle !== targetStyle) {
            currentMapStyle = targetStyle;
            map.setStyle(targetStyle);
        }
    }

    // Update Navigation Dashboard UI
    if (isNavigating && currentRouteData) {
        updateNavigationDashboard(userPos);
    }

    // Update Speedometer
    const speedEl = document.getElementById('nav-speed');
    if (speedEl) {
        // speed is in m/s, convert to km/h. Handle null/undefined.
        const kmh = speed ? (speed * 3.6) : 0;
        speedEl.innerText = Math.round(kmh);
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

function showWrongWayAlert() {
    wrongWayState.isAlerting = true;
    const alert = document.getElementById('wrong-way-alert');
    if (alert) alert.style.display = 'flex';
    speak("Wrong way. Turn around.");
}

function hideWrongWayAlert() {
    wrongWayState.isAlerting = false;
    wrongWayState.active = false;
    const alert = document.getElementById('wrong-way-alert');
    if (alert) alert.style.display = 'none';
}

function showReactionToast(emoji) {
    const toast = document.createElement('div');
    toast.innerText = emoji;
    toast.style.cssText = `
        position: fixed; bottom: 120px; left: 20px; transform: scale(0);
        font-size: 4rem; pointer-events: none; z-index: 3000;
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-in;
        opacity: 0; text-shadow: 0 4px 10px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => { toast.style.transform = 'scale(1.5)'; toast.style.opacity = '1'; });
    // Animate Out
    setTimeout(() => { toast.style.transform = 'translateY(-100px) scale(2)'; toast.style.opacity = '0'; }, 1500);
    setTimeout(() => toast.remove(), 2000);
}

async function performAutomaticReroute(userPos) {
    isRerouting = true;
    speak("Rerouting...");

    // Update start point to current location
    waypoints[0] = userPos;
    if (geocoders[0]) geocoders[0].setInput("Current Location");

    // Calculate Bearing based on trend (past 4 seconds)
    let bearing = 0;
    const targetTime = Date.now() - 4000;
    // Find closest point in history to targetTime
    const prevItem = recentLocations.reduce((prev, curr) => 
        Math.abs(curr.timestamp - targetTime) < Math.abs(prev.timestamp - targetTime) ? curr : prev
    , recentLocations[0]);

    if (prevItem && turf.distance(prevItem.coords, userPos, {units: 'meters'}) > 5) {
        bearing = turf.bearing(prevItem.coords, userPos);
        bearing = (bearing + 360) % 360; // Normalize to 0-360
    } else if (lastKnownHeading !== null && lastKnownHeading !== undefined) {
         bearing = lastKnownHeading;
    }

    // Format for Mapbox: "angle,tolerance"
    // We apply this bearing constraint ONLY to the start point.
    const bearingStr = `${Math.round(bearing)},45`;
    const validWps = waypoints.filter(w => w);
    // Param format: "90,45;;;" (semicolon for each subsequent waypoint)
    const bearingsParam = bearingStr + ';' + Array(validWps.length - 1).fill('').join(';');

    // Update UI to show activity
    const navInstr = document.getElementById('nav-instr');
    if (navInstr) navInstr.innerHTML = `<i data-feather="loader" class="spin-anim"></i> Rerouting...`;
    if (feather) feather.replace();

    try {
        await calculateRoute({ bearings: bearingsParam, suppressAlerts: true });
    } catch (e) {
        console.error("Reroute failed", e);
    } finally {
        isRerouting = false;
    }
}

function initNavigationOverlays() {
    if (document.getElementById('nav-overlay-top')) return;

    // Top Banner (Instructions)
    const topOverlay = document.createElement('div');
    topOverlay.id = 'nav-overlay-top';
    topOverlay.innerHTML = `
        <div style="display:flex; justify-content:space-between; width:100%; align-items:flex-start;">
            <div class="nav-distance-large" id="nav-next-dist">0 m</div>
            <div id="nav-viewer-count" style="display:none; background:rgba(0,0,0,0.6); color:white; padding:4px 10px; border-radius:12px; font-size:0.85rem; align-items:center; gap:6px; margin-right: 50px; cursor:pointer; pointer-events:auto;">
                <i data-feather="eye" style="width:14px; height:14px;"></i> 
                <span id="viewer-count-val">0</span>
            </div>
        </div>
        <div class="nav-instruction-large" id="nav-instr">Locating...</div>
        <button id="nav-mute-btn" class="nav-mute-btn"><i data-feather="volume-2"></i></button>
    `;
    document.body.appendChild(topOverlay);

    // NEW: Chat Overlay (Read-only / Status trigger)
    const chatOverlayEl = document.createElement('div');
    chatOverlayEl.id = 'nav-chat-overlay';
    chatOverlayEl.style.cssText = `
        position: absolute; bottom: 180px; left: 20px; width: 250px;
        pointer-events: auto; z-index: 25; display: flex; flex-direction: column;
        gap: 8px; align-items: flex-start; cursor: pointer;
    `;
    chatOverlayEl.onclick = showStatusOptions; // Default to status options when running
    document.body.appendChild(chatOverlayEl);

    // NEW: Viewer Indicator (Bottom Left)
    const viewerOverlay = document.createElement('div');
    viewerOverlay.id = 'nav-viewer-overlay';
    viewerOverlay.style.cssText = `
        position: absolute; bottom: 140px; left: 20px;
        background: rgba(0,0,0,0.5); color: white; padding: 4px 8px;
        border-radius: 4px; font-size: 0.8rem; pointer-events: none; z-index: 25; display: none;
    `;
    document.body.appendChild(viewerOverlay);

    // Bottom Bar (Stats & Exit)
    const bottomOverlay = document.createElement('div');
    bottomOverlay.id = 'nav-overlay-bottom';
    bottomOverlay.innerHTML = `
        <div class="nav-stats-group">
            <div class="nav-stat-item">
                <span class="nav-stat-value" id="nav-speed">0</span>
                <span class="nav-stat-label">km/h</span>
            </div>
            <div class="nav-stat-item">
                <span class="nav-stat-value" id="nav-time-now">--:--</span>
                <span class="nav-stat-label">Time</span>
            </div>
            <div class="nav-stat-item">
                <span class="nav-stat-value" id="nav-eta">--:--</span>
                <span class="nav-stat-label">ETA</span>
            </div>
            <div class="nav-stat-item">
                <span class="nav-stat-value" id="nav-time-rem">--</span>
                <span class="nav-stat-label">min</span>
            </div>
            <div class="nav-stat-item">
                <span class="nav-stat-value" id="nav-dist-rem">--</span>
                <span class="nav-stat-label">km</span>
            </div>
        </div>
        <div class="nav-controls-row" style="overflow-x: auto; white-space: nowrap; justify-content: flex-start; padding-bottom: 4px; -webkit-overflow-scrolling: touch;">
            <button id="pause-nav-btn" style="flex-shrink:0;">Pause</button>
            <button id="exit-nav-btn" style="display:none; flex-shrink:0;">Exit Navigation</button>
            <button id="send-status-btn" style="display:none; background-color:#9b59b6; color:white; border:none; padding:12px 24px; border-radius:30px; font-weight:600; cursor:pointer; flex-shrink:0;">Status</button>
            <button id="host-dash-btn" style="display:none; background-color:#8e44ad; color:white; border:none; padding:12px 24px; border-radius:30px; font-weight:600; cursor:pointer; flex-shrink:0;">Live Chat</button>
            <button id="share-nav-btn" style="display:none; background-color:#2ecc71; color:white; border:none; padding:12px 24px; border-radius:30px; font-weight:600; cursor:pointer; flex-shrink:0;">Share</button>
            <button id="stop-share-btn" style="display:none; background-color:#3498db; color:white; border:none; padding:12px 24px; border-radius:30px; font-weight:600; cursor:pointer; flex-shrink:0;">Stop Sharing</button>
        </div>
    `;
    document.body.appendChild(bottomOverlay);

    // Wrong Way Alert Overlay (unchanged)
    const wrongWayOverlay = document.createElement('div');
    wrongWayOverlay.id = 'wrong-way-alert';
    wrongWayOverlay.style.display = 'none';
    wrongWayOverlay.innerHTML = `
        <div style="background:#e74c3c; color:white; padding:20px; border-radius:12px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,0.3); display:flex; flex-direction:column; align-items:center;">
            <i data-feather="alert-triangle" style="width:48px; height:48px; margin-bottom:10px;"></i>
            <div style="font-size:1.5rem; font-weight:800;">WRONG WAY</div>
            <div style="font-size:1rem;">Turn around</div>
        </div>
    `;
    Object.assign(wrongWayOverlay.style, { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: '100' });
    document.body.appendChild(wrongWayOverlay);

    const pauseBtn = document.getElementById('pause-nav-btn');
    const exitBtn = document.getElementById('exit-nav-btn');
    const dashBtn = document.getElementById('host-dash-btn');
    const shareBtn = document.getElementById('share-nav-btn');

    // Show Stop Sharing if session is active
    if (liveSessionId) {
        document.getElementById('stop-share-btn').style.display = 'block';
        document.getElementById('send-status-btn').style.display = 'block';
        // host-dash-btn remains hidden until paused
        if (shareBtn) shareBtn.style.display = 'block';
    }

    // Bind listeners unconditionally (they check liveSessionId at runtime)
    document.getElementById('nav-viewer-count').onclick = () => { if (liveSessionId) showHostLiveDashboard(liveSessionId); };
    document.getElementById('host-dash-btn').onclick = () => { if (liveSessionId) showHostLiveDashboard(liveSessionId); };

    if (shareBtn) {
        shareBtn.onclick = () => {
            if (liveSessionId) {
                const url = `${window.location.origin}${window.location.pathname}?track=${liveSessionId}`;
                showAutoShareModal(url);
            }
        };
    }

    pauseBtn.onclick = () => {
        if (exitBtn.style.display === 'none') {
            // Pause State: Show Exit button
            exitBtn.style.display = 'block';
            pauseBtn.innerText = 'Resume';
            pauseBtn.style.backgroundColor = '#2ecc71'; // Green
            pauseBtn.style.color = '#fff';
            
            // Show Live Dash/Chat button when paused
            if (liveSessionId && dashBtn) dashBtn.style.display = 'block';
            
            // Allow typing in chat overlay
            if (chatOverlayEl) chatOverlayEl.onclick = () => { if (liveSessionId) showChatModal(liveSessionId, "Host", true); };
        } else {
            // Resume State: Hide Exit button
            exitBtn.style.display = 'none';
            pauseBtn.innerText = 'Pause';
            pauseBtn.style.backgroundColor = '#f1c40f'; // Yellow
            pauseBtn.style.color = '#212121';
            
            if (dashBtn) dashBtn.style.display = 'none';
            
            // Revert chat overlay to Status Options
            if (chatOverlayEl) chatOverlayEl.onclick = showStatusOptions;
        }
    };

    exitBtn.onclick = () => {
        // Reset UI state
        exitBtn.style.display = 'none';
        pauseBtn.innerText = 'Pause';
        pauseBtn.style.backgroundColor = '#f1c40f';
        pauseBtn.style.color = '#212121';
        if (dashBtn) dashBtn.style.display = 'none';
        if (chatOverlayEl) chatOverlayEl.onclick = showStatusOptions;
        toggleNavigation();
    };

    document.getElementById('stop-share-btn').onclick = async () => {
        if (confirm("Stop sharing your live location?")) {
            await endLiveSession(liveSessionId);
            liveSessionId = null;
            document.getElementById('stop-share-btn').style.display = 'none';
        }
    };

    document.getElementById('send-status-btn').onclick = showStatusOptions;

    // Mute Button Logic
    const muteBtn = document.getElementById('nav-mute-btn');
    muteBtn.onclick = () => {
        isMuted = !isMuted;
        muteBtn.classList.toggle('muted', isMuted);
        muteBtn.innerHTML = isMuted ? `<i data-feather="volume-x"></i>` : `<i data-feather="volume-2"></i>`;
        if (feather) feather.replace();
    };

    // Refresh icons for new elements
    if (feather) feather.replace();
}

function updateChatOverlay(messages) {
    const container = document.getElementById('nav-chat-overlay');
    if (!container) return;
    
    // Show last 3 messages
    const recent = messages.slice(-3);
    container.innerHTML = '';
    recent.forEach(msg => {
        const div = document.createElement('div');
        div.style.cssText = `
            background: rgba(0,0,0,0.6); color: white; padding: 6px 10px;
            border-radius: 12px; font-size: 0.9rem; max-width: 100%;
            backdrop-filter: blur(4px); text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        `;
        div.innerHTML = `<strong style="font-size:0.75rem; color:#ddd;">${msg.sender}:</strong> ${msg.text}`;
        container.appendChild(div);
    });
}

function updateViewerOverlay(viewers) {
    const container = document.getElementById('nav-viewer-overlay');
    if (!container) return;
    
    if (viewers.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    const names = viewers.map(v => v.name || 'Guest');
    let text = '';
    if (names.length <= 2) {
        text = 'Watching: ' + names.join(', ');
    } else {
        text = `Watching: ${names[0]}, ${names[1]} +${names.length - 2}`;
    }
    container.innerText = text;
}

function showStatusOptions() {
    const existing = document.getElementById('status-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'status-modal';
    modal.style.cssText = `
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 320px;
        background: var(--panel-bg, #fff); border: 1px solid var(--border-color, #ccc);
        border-radius: 12px; padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 2000; display: flex; flex-direction: column; gap: 8px;
    `;

    const options = ["On my way 🚴", "Delayed 5m ⏱️", "Heavy Traffic 🚗", "Taking a break ☕", "Arriving soon 🏁"];
    
    modal.innerHTML = `<h3 style="margin:0 0 8px 0; font-size:1rem;">Send Status</h3>`;
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt;
        btn.style.cssText = `padding:10px; border:1px solid #eee; background:#f9f9f9; border-radius:8px; cursor:pointer; text-align:left;`;
        btn.onclick = () => {
            if (liveSessionId) {
                updateLiveSession(liveSessionId, { statusMessage: opt });
            }
            modal.remove();
        };
        modal.appendChild(btn);
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerText = "Cancel";
    closeBtn.style.cssText = `padding:10px; border:none; background:none; color:#e74c3c; cursor:pointer; margin-top:4px;`;
    closeBtn.onclick = () => modal.remove();
    modal.appendChild(closeBtn);

    document.body.appendChild(modal);
}

function getViewerId() {
    let id = localStorage.getItem('viewer_id');
    if (!id) {
        id = 'v_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('viewer_id', id);
    }
    return id;
}

function updateNavigationDashboard(userPos) {
    if (!currentRouteData || !currentRouteData.legs) return;

    const steps = currentRouteData.legs[0].steps;
    // Determine next step (simple logic: step after the last spoken one)
    let nextStepIndex = lastSpokenStepIndex + 1;
    if (nextStepIndex >= steps.length) nextStepIndex = steps.length - 1;

    const nextStep = steps[nextStepIndex];
    if (nextStep && nextStep.maneuver) {
        document.getElementById('nav-instr').innerText = nextStep.maneuver.instruction;
        const distToTurn = turf.distance(userPos, nextStep.maneuver.location, { units: 'kilometers' });
        document.getElementById('nav-next-dist').innerText = distToTurn < 1 ? `${(distToTurn * 1000).toFixed(0)} m` : `${distToTurn.toFixed(1)} km`;
    }

    // Update Remaining Stats (Approximate straight line to end for performance)
    const endPoint = currentRouteData.geometry.coordinates[currentRouteData.geometry.coordinates.length - 1];
    const totalDistKm = turf.distance(userPos, endPoint, { units: 'kilometers' });
    const pace = parseFloat(document.getElementById('user-pace')?.value) || 20;

    document.getElementById('nav-dist-rem').innerText = totalDistKm.toFixed(1);
    document.getElementById('nav-time-rem').innerText = Math.round((totalDistKm / pace) * 60);

    // Update Current Time & ETA
    const now = new Date();
    document.getElementById('nav-time-now').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const durationMins = (totalDistKm / pace) * 60;
    const eta = new Date(now.getTime() + durationMins * 60000);
    document.getElementById('nav-eta').innerText = eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Push ETA to Live Session
    if (liveSessionId) {
        updateLiveSession(liveSessionId, {
            coords: userPos,
            eta: eta,
            distanceRemaining: totalDistKm
        });
    }
}

function stopLiveTracking() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (mockIntervalId) clearInterval(mockIntervalId);
    if (liveSessionUnsubscribe) liveSessionUnsubscribe();
    liveSessionUnsubscribe = null;
    if (chatUnsubscribe) chatUnsubscribe();
    chatUnsubscribe = null;
    if (chatOverlayUnsubscribe) chatOverlayUnsubscribe();
    chatOverlayUnsubscribe = null;
    if (viewerOverlayUnsubscribe) viewerOverlayUnsubscribe();
    viewerOverlayUnsubscribe = null;
    mockIntervalId = null;
    isNavigating = false;
    lastSpokenStepIndex = -1;
    hideWrongWayAlert();
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

    // This manual toggle overrides the auto-nav style temporarily
    // Optional: Switch Map Style (Requires redrawing route if active)
    const style = isDark ? 'mapbox://styles/mapbox/navigation-night-v1' : 'mapbox://styles/mapbox/navigation-day-v1';
    currentMapStyle = style; // Sync global state
    let usesNavigationStyle = true; // Tracks whether current style is a navigation style (day/night)
    map.setStyle(style);

    map.once('style.load', () => {

        // Redraw route if exists
        if (currentRouteData) {
            drawStaticRoute(map, currentRouteData.geometry, !isNavigating);
        }
    });
}

async function showLinkUI(route) {
    const container = document.getElementById('share-output-area');
    // Show loading state
    container.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-secondary);"><i data-feather="loader" class="spin-anim"></i> Saving route to cloud...</div>`;
    if (feather) feather.replace();

    try {
        // OPTIMIZATION: Compress legs to avoid Firestore 1MB limit
        const compressedLegs = compressRouteLegs(route.legs);

        // Prepare exact route data
        const data = {
            name: "Shared Route",
            geometry: JSON.stringify(route.geometry),
            distance: route.distance,
            duration: route.duration,
            legs: JSON.stringify(compressedLegs || []), 
            savedWaypoints: JSON.stringify(waypoints),
        };

        // Save to "shared_routes" collection
        const shareId = await saveSharedRoute(data);

        // Generate ID-based URL
        const baseUrl = window.location.href.split('?')[0].split('#')[0];
        const url = `${baseUrl}?share_id=${shareId}`;
        
        renderLinkBox("Shared Route Link (100% Identical)", url);
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:#e74c3c; text-align:center;">Failed to generate link. Route may be too long.</p>`;
    }
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
    const shareId = params.get('share_id');
    const routeParam = params.get('route');
    const start = params.get('start');
    const end = params.get('end');

    if (shareId) {
        // --- LOAD EXACT SHARED ROUTE ---
        const data = await fetchSharedRoute(shareId);
        if (data) {
            // 1. Restore Route Object
            const routeObj = {
                geometry: JSON.parse(data.geometry),
                distance: data.distance,
                duration: data.duration || 0,
                legs: JSON.parse(data.legs),
                weight_name: 'shared',
                weight: 0
            };

            // 2. Restore Waypoints
            if (data.savedWaypoints) {
                waypoints = JSON.parse(data.savedWaypoints);
            } else {
                const geo = routeObj.geometry;
                waypoints = [geo.coordinates[0], geo.coordinates[geo.coordinates.length - 1]];
            }

            // 3. Update UI Inputs
            geocoders.forEach(g => g.clear());
            while (geocoders.length < waypoints.length) addDestination();
            
            waypoints.forEach((wp, i) => {
                if (geocoders[i]) geocoders[i].setInput(i === 0 ? "Shared Start" : i === waypoints.length - 1 ? "Shared Dest" : "Shared Stop");
                if (geocoders[i] && geocoders[i]._inputEl) {
                    geocoders[i]._inputEl.closest('.location-input-wrapper').classList.add('location-set');
                }
            });

            addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
            switchTab('directions');
            handleRouteSelection(routeObj, false);
            return;
        }
    } else if (routeParam) {
        const points = routeParam.split(';');
        if (points.length < 2) return;

        // 1. Set Start & End (always exist on load)
        waypoints[0] = points[0].split(',').map(Number);
        waypoints[1] = points[1].split(',').map(Number);

        // 2. Add intermediate destinations if any
        for (let i = 2; i < points.length; i++) {
            addDestination(); // Adds a new slot at end of waypoints/geocoders arrays
            waypoints[i] = points[i].split(',').map(Number);
        }

        // 3. Update UI Texts (Reverse Geocoding)
        const updateInput = async (index, coords) => {
            try {
                const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?access_token=${MAPBOX_TOKEN}`);
                const data = await res.json();
                if (data.features && data.features[0] && geocoders[index]) {
                    geocoders[index].setInput(data.features[0].place_name);
                    if (geocoders[index]._inputEl) {
                        geocoders[index]._inputEl.closest('.location-input-wrapper').classList.add('location-set');
                    }
                }
            } catch (e) { console.error("Reverse geocode failed", e); }
        };

        await Promise.all(waypoints.map((wp, i) => updateInput(i, wp)));

        addRouteMarkers(map, waypoints, handleMarkerDrag);
        calculateRoute();

    } else if (start && end) {
        waypoints[0] = start.split(',').map(Number);
        waypoints[1] = end.split(',').map(Number);

        // Update Geocoders visually (reverse geocoding optional but good)
        geocoders[0].setInput(start);
        geocoders[1].setInput(end);
        if (geocoders[0]._inputEl) geocoders[0]._inputEl.closest('.location-input-wrapper').classList.add('location-set');
        if (geocoders[1]._inputEl) geocoders[1]._inputEl.closest('.location-input-wrapper').classList.add('location-set');

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

// In renderElevationChart(data) — Replace the entire function with this fixed version

function renderElevationChart(data) {
    const statsContainer = document.getElementById('stats-container');
    let container = document.getElementById('elevation-container');

    if (!container) {
        container = document.createElement('div');
        container.id = 'elevation-container';
        statsContainer.parentNode.insertBefore(container, statsContainer.nextSibling);
    }

    // Safety: if insufficient data, show empty state instead of crashing
    if (data.length < 2) {
        container.innerHTML = '<p class="empty-state">No elevation data available for this route.</p>';
        return;
    }

    // Always (re)create canvas to ensure clean state
    container.innerHTML = `
        <div class="chart-header">
            <span class="label">Elevation Profile</span>
            <span class="value" id="elev-gain"></span>
        </div>
        <canvas id="elevation-canvas"></canvas>
    `;

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
    const validElevations = elevations.filter(e => e !== null && e !== undefined);
    if (validElevations.length === 0) {
        container.innerHTML = '<p class="empty-state">No elevation data available.</p>';
        return;
    }

    let minElev = Math.min(...validElevations);
    let maxElev = Math.max(...validElevations);

    // True gain (before any visual padding)
    const trueGain = Math.round(maxElev - minElev);
    document.getElementById('elev-gain').innerText = `+${trueGain}m`;

    // Light visual exaggeration only if very flat (helps visibility)
    if (trueGain < 20) {
        const center = (minElev + maxElev) / 2;
        minElev = center - 10;
        maxElev = center + 10;
    }

    const totalDist = data[data.length - 1].distance;
    const range = maxElev - minElev || 10; // Prevent divide-by-zero

    // 3. Draw Function
    const draw = (mouseX = null) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(margin.left, margin.top);

        // Axes
        ctx.beginPath();
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.moveTo(0, 0); ctx.lineTo(0, height);
        ctx.moveTo(0, height); ctx.lineTo(width, height);
        ctx.stroke();

        // Axis Labels
        ctx.fillStyle = '#5f6368';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(maxElev)}m`, -5, 0);
        ctx.fillText(`${Math.round(minElev)}m`, -5, height);
        ctx.textAlign = 'center';
        ctx.fillText(`${(totalDist / 1000).toFixed(1)}km`, width / 2, height + 15);

        // Filled Area
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

        // Profile Line — Fixed: add explicit moveTo for first point
        ctx.beginPath();
        if (data.length > 0) {
            const firstX = (data[0].distance / totalDist) * width;
            const firstY = height - ((data[0].elevation - minElev) / range) * height;
            ctx.moveTo(firstX, firstY);
        }
        data.forEach(d => {
            const x = (d.distance / totalDist) * width;
            const y = height - ((d.elevation - minElev) / range) * height;
            ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#3887be';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Hover Effect (unchanged)
        if (mouseX !== null) {
            const xRatio = Math.max(0, Math.min(1, (mouseX - margin.left) / width));
            const targetDist = xRatio * totalDist;
            const point = data.reduce((prev, curr) =>
                Math.abs(curr.distance - targetDist) < Math.abs(prev.distance - targetDist) ? curr : prev
            );

            const x = (point.distance / totalDist) * width;
            const y = height - ((point.elevation - minElev) / range) * height;

            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, height);
            ctx.strokeStyle = '#212121';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#212121';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${Math.round(point.elevation)}m`, x, y - 10);

            if (!elevationMarker) {
                elevationMarker = new mapboxgl.Marker({ color: '#f39c12', scale: 0.8 })
                    .setLngLat(point.coord)
                    .addTo(map);
            } else {
                elevationMarker.setLngLat(point.coord);
            }
        } else {
            if (elevationMarker) {
                elevationMarker.remove();
                elevationMarker = null;
            }
        }

        ctx.translate(-margin.left, -margin.top);
    };

    draw();

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        draw(x);
    };
    canvas.onmouseleave = () => draw(null);
}

function speak(text) {
    if (!speechSynth || isMuted) return;
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
function updateWindImpactMeters({ tail = 0, head = 0, cross = 0 }) {
    const setMeter = (valId, barId, pct) => {
        const valEl = document.getElementById(valId);
        if (valEl) valEl.innerText = `${Math.round(pct)}%`;
        const barEl = document.getElementById(barId);
        if (barEl) barEl.style.width = `${pct}%`;
    };
    setMeter('tw-val', 'tw-bar', tail);
    setMeter('hw-val', 'hw-bar', head);
    setMeter('cw-val', 'cw-bar', cross);
    setMeter('wx-tw-val', 'wx-tw-bar', tail);
    setMeter('wx-hw-val', 'wx-hw-bar', head);
    setMeter('wx-cw-val', 'wx-cw-bar', cross);
}

// Helper: Haversine distance in km
function haversineDistance(p1, p2) {
    const [lon1, lat1] = p1;
    const [lon2, lat2] = p2;
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c / 1000; // km
}

// Helper: Bearing from point1 to point2 (0-360)
function calculateBearing(p1, p2) {
    let [lon1, lat1] = p1;
    let [lon2, lat2] = p2;
    lon1 *= Math.PI / 180;
    lon2 *= Math.PI / 180;
    lat1 *= Math.PI / 180;
    lat2 *= Math.PI / 180;

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

async function computeRouteWindImpact(geometry) {
    if (!geometry || geometry.type !== 'LineString' || geometry.coordinates.length < 2) {
        return { tail: 0, head: 0, cross: 100 };
    }

    const coords = geometry.coordinates;

    // Sample points evenly by index (dense routes ≈ even distance)
    const maxSamples = 15;
    const numSamples = Math.min(maxSamples, Math.max(3, Math.floor(coords.length / 50) + 2));
    const sampleIndices = [];
    for (let i = 0; i < numSamples; i++) {
        const fraction = i / (numSamples - 1);
        sampleIndices.push(Math.round(fraction * (coords.length - 1)));
    }

    const samplePoints = sampleIndices.map(idx => ({
        lat: coords[idx][1],
        lon: coords[idx][0],
        time: null
    }));

    let weatherData = await fetchRouteForecast(samplePoints);

    // Pad with last valid or null
    while (weatherData.length < numSamples) {
        weatherData.push(weatherData[weatherData.length - 1] ?? null);
    }

    let tailM = 0, headM = 0, crossM = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        const start = coords[i];
        const end = coords[i + 1];
        const segKm = haversineDistance(start, end);
        if (segKm === 0) continue;

        // Approximate mid index for closest sample
        const midIdx = Math.floor(i + 0.5);
        let closestSampleIdx = 0;
        let minDist = Infinity;
        sampleIndices.forEach((sIdx, s) => {
            const dist = Math.abs(midIdx - sIdx);
            if (dist < minDist) {
                minDist = dist;
                closestSampleIdx = s;
            }
        });

        const wd = weatherData[closestSampleIdx];

        let impact = 'crosswind';
        if (wd && wd.bearing != null) {
            const bearing = calculateBearing(start, end);
            impact = calculateWindImpact(bearing, wd.bearing);
        }
        // else treat as crosswind (no data)

        const segM = segKm * 1000;
        if (impact === 'tailwind') tailM += segM;
        else if (impact === 'headwind') headM += segM;
        else crossM += segM;
    }

    const totalM = tailM + headM + crossM || 1; // avoid divide by zero

    return {
        tail: Math.round((tailM / totalM) * 100),
        head: Math.round((headM / totalM) * 100),
        cross: Math.round((crossM / totalM) * 100)
    };
}

function analyzeRouteCharacteristics(route) {
    let totalDist = route.distance || 1; // Avoid div by 0
    let aRoadDist = 0;
    let motorwayDist = 0;
    let cycleDist = 0;
    let scenicDist = 0;

    if (route.legs) {
        route.legs.forEach(leg => {
            leg.steps.forEach(step => {
                const d = step.distance;
                const name = step.name || "";
                const ref = step.ref || "";
                
                // Check for A-Roads (e.g., "A1", "A406")
                if (/\bA\d+\b/.test(ref) || /\bA\d+\b/.test(name)) {
                    aRoadDist += d;
                }

                // Check for Motorways (e.g., "M1", "M25")
                if (/\bM\d+\b/.test(ref) || /\bM\d+\b/.test(name)) {
                    motorwayDist += d;
                }

                // Check for Cycle-friendly keywords
                const lowerName = name.toLowerCase();
                const lowerRef = ref.toLowerCase();
                if (lowerName.includes('cycle') || lowerName.includes('path') || 
                    lowerName.includes('greenway') || lowerName.includes('towpath') || 
                    lowerRef.includes('ncn')) {
                    cycleDist += d;
                }

                // Check for Scenic keywords (Parks, Forests, Water)
                if (lowerName.includes('park') || lowerName.includes('forest') || 
                    lowerName.includes('wood') || lowerName.includes('common') ||
                    lowerName.includes('trail') || lowerName.includes('river') ||
                    lowerName.includes('canal') || lowerName.includes('lake')) {
                    scenicDist += d;
                }
            });
        });
    }

    return {
        aRoadPct: Math.round((aRoadDist / totalDist) * 100),
        motorwayPct: Math.round((motorwayDist / totalDist) * 100),
        cycleLanePct: Math.round((cycleDist / totalDist) * 100),
        scenicScore: Math.round((scenicDist / totalDist) * 100)
    };
}

// Helper to reduce route object size for Firestore (1MB limit)
function compressRouteLegs(legs) {
    if (!legs) return [];
    return legs.map(leg => ({
        ...leg,
        steps: leg.steps.map(step => {
            // Exclude heavy properties to save space
            // intersections: array of every intersection passed (huge)
            // geometry: step-specific geometry (redundant with main route geometry)
            // voiceInstructions/bannerInstructions: verbose text
            const { intersections, geometry, voiceInstructions, bannerInstructions, ...rest } = step;
            return rest;
        }),
        annotation: undefined
    }));
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

function loadFavoritesList() {
    const list = document.getElementById('favorites-list');
    if (!list) return;
    
    const favorites = getFavorites();
    
    if (favorites.length === 0) {
        list.innerHTML = '<p class="empty-state">No favorite locations yet.<br><small>Star locations in the search bar to add them here.</small></p>';
        return;
    }

    list.innerHTML = '';
    favorites.forEach((fav, index) => {
        const div = document.createElement('div');
        div.className = 'saved-route-item';

        const contentDiv = document.createElement('div');
        contentDiv.style.flex = '1';
        const title = fav.text || fav.place_name.split(',')[0];
        contentDiv.innerHTML = `
            <div style="font-weight:600;">${title}</div>
            <div style="font-size:0.8em; color:var(--text-secondary);">${fav.place_name}</div>
        `;

        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '4px';

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-route-btn';
        delBtn.innerHTML = '<i data-feather="trash-2"></i>';
        delBtn.title = "Remove Favorite";
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Remove "${title}" from favorites?`)) {
                removeFavorite(index);
            }
        };

        div.appendChild(contentDiv);
        div.appendChild(actionsDiv);
        actionsDiv.appendChild(delBtn);

        div.onclick = () => {
            switchTab('plan');

            // Set as Destination (Last Waypoint)
            const destIndex = waypoints.length - 1;
            
            if (geocoders[destIndex]) {
                geocoders[destIndex].setInput(fav.place_name);
                if (geocoders[destIndex]._inputEl) {
                    geocoders[destIndex]._inputEl.closest('.location-input-wrapper').classList.add('location-set');
                }
            }
            waypoints[destIndex] = fav.center;
            currentFeatures[destIndex] = fav;

            // Update Star Button
            const wrappers = document.querySelectorAll('.location-input-wrapper');
            if (wrappers[destIndex]) {
                const starBtn = wrappers[destIndex].querySelector('.star-btn');
                if (starBtn) {
                    starBtn.classList.add('active');
                    starBtn.innerHTML = `<i data-feather="star" fill="currentColor"></i>`;
                    if (feather) feather.replace();
                }
            }

            if (!waypoints[0]) {
                locateUser();
            } else {
                addRouteMarkers(map, waypoints.filter(w => w), handleMarkerDrag);
                calculateRoute();
            }
            map.flyTo({ center: fav.center, zoom: 14 });
        };

        list.appendChild(div);
    });
    if (feather) feather.replace();
}

// Helper to mount chat into a container
function mountChatUI(container, sessionId, senderName, isHost, initialText = '') {
    let controlsHtml = '';
    if (isHost) {
        controlsHtml = `
            <div style="padding: 0 12px; display:flex; align-items:center; gap:6px; font-size:0.8rem; color:#555;">
                <input type="checkbox" id="chat-to-all" checked>
                <label for="chat-to-all">Broadcast to All</label>
            </div>
        `;
    }

    // Ensure container is flex column so children size correctly
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    container.innerHTML = `
        <div class="chat-messages" style="flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px;"></div>
        ${controlsHtml}
        <div style="padding:12px; border-top:1px solid #eee; display:flex; gap:8px; background: #fff; flex-shrink: 0;">
            <input type="text" class="chat-input" placeholder="Type a message..." style="flex:1; padding:8px; border:1px solid #ddd; border-radius:20px; color: #000; background: #fff;">
            <button class="chat-send" style="background:var(--accent-blue); color:white; border:none; padding:8px 12px; border-radius:20px; cursor:pointer;"><i data-feather="send"></i></button>
        </div>
    `;
    
    const msgContainer = container.querySelector('.chat-messages');
    const input = container.querySelector('.chat-input');
    const sendBtn = container.querySelector('.chat-send');

    if (initialText) {
        input.value = initialText;
        input.focus();
    }

    const unsubscribe = subscribeToChat(sessionId, (messages) => {
        msgContainer.innerHTML = '';
        messages.forEach(msg => {
            // Visibility Logic
            let isVisible = false;
            if (isHost) isVisible = true; // Host sees all
            else if (msg.visibility === 'public') isVisible = true; // Public messages
            else if (msg.senderId === currentUser?.uid) isVisible = true; // My own messages
            
            if (!isVisible) return;

            const div = document.createElement('div');
            const isMe = msg.sender === senderName;
            const isPrivate = msg.visibility === 'private';

            div.style.cssText = `
                align-self: ${isMe ? 'flex-end' : 'flex-start'};
                background: ${isMe ? '#dcf8c6' : '#f1f0f0'};
                ${isPrivate ? 'border: 1px dashed #999;' : ''}
                padding: 6px 10px; border-radius: 12px; max-width: 80%;
                font-size: 0.9rem;
            `;
            div.innerHTML = `
                <div style="font-size:0.7rem; color:#888; margin-bottom:2px; display:flex; justify-content:space-between;">
                    <span>${msg.sender}</span>
                    ${isPrivate ? '<span style="font-size:0.6rem; margin-left:4px;">🔒</span>' : ''}
                </div>
                ${msg.text}
            `;
            msgContainer.appendChild(div);
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });

    const sendMessage = () => {
        const text = input.value.trim();
        if (text) {
            const options = { senderId: currentUser?.uid };
            if (isHost) {
                const toAll = container.querySelector('#chat-to-all').checked;
                options.visibility = toAll ? 'public' : 'private';
            } else {
                options.visibility = 'private'; // Viewers always private to host
            }
            sendChatMessage(sessionId, senderName, text, options);
            input.value = '';
        }
    };

    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    if (feather) feather.replace();

    return unsubscribe;
}

function showChatModal(sessionId, senderName, isHost) {
    const existing = document.getElementById('chat-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'chat-modal';
    modal.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; width: 320px; height: 400px;
        background: var(--panel-bg, #fff); border: 1px solid var(--border-color, #ccc);
        border-radius: 12px; padding: 0; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 2100; display: flex; flex-direction: column; overflow: hidden;
    `;

    modal.innerHTML = `
        <div style="padding:12px; background:#f8f9fa; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:1rem;">💬 Chat</h3>
            <button id="close-chat" style="border:none; background:none; cursor:pointer;"><i data-feather="x"></i></button>
        </div>
        <div id="chat-content" style="flex:1; overflow:hidden;"></div>
    `;
    document.body.appendChild(modal);
    if (feather) feather.replace();

    const contentDiv = document.getElementById('chat-content');
    chatUnsubscribe = mountChatUI(contentDiv, sessionId, senderName, isHost);

    document.getElementById('close-chat').onclick = () => {
        if (chatUnsubscribe) chatUnsubscribe();
        modal.remove();
    };
}

function showHostLiveDashboard(sessionId) {
    const existing = document.getElementById('host-dashboard');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'host-dashboard';
    modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 90%; max-width: 400px; height: 500px;
        background: var(--panel-bg, #fff); border: 1px solid var(--border-color, #ccc);
        border-radius: 12px; padding: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 2200; display: flex; flex-direction: column; overflow: hidden;
    `;

    modal.innerHTML = `
        <div style="padding:15px; background:#f8f9fa; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:1.1rem;">🔴 Live Dashboard</h3>
            <button id="close-dash" style="border:none; background:none; cursor:pointer;"><i data-feather="x"></i></button>
        </div>
        <div style="display:flex; border-bottom:1px solid #eee;">
            <button class="tab-btn active" id="tab-chat-btn" style="flex:1; border-radius:0;">Chat</button>
            <button class="tab-btn" id="tab-viewers-btn" style="flex:1; border-radius:0;">Viewers</button>
        </div>
        <div id="dash-content" style="flex:1; overflow:hidden; position:relative;"></div>
    `;
    document.body.appendChild(modal);
    if (feather) feather.replace();

    document.getElementById('close-dash').onclick = () => modal.remove();

    const content = document.getElementById('dash-content');
    let currentUnsubscribe = null;
    
    const renderViewers = () => {
        if (currentUnsubscribe) currentUnsubscribe();
        content.innerHTML = `<div style="padding:15px; overflow-y:auto; height:100%;"><h4 style="margin-top:0;">Active Viewers</h4><div id="viewer-list">Loading...</div></div>`;
        
        currentUnsubscribe = subscribeToViewers(sessionId, (viewers) => {
            const list = document.getElementById('viewer-list');
            if(!list) return;
            list.innerHTML = viewers.length === 0 ? '<p style="color:#888;">No registered viewers.</p>' : '';
            viewers.forEach(v => {
                const row = document.createElement('div');
                row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #eee;";
                
                const infoDiv = document.createElement('div');
                infoDiv.innerHTML = `<div style="font-weight:600;">${v.name || 'Guest'}</div><div style="font-size:0.75rem; color:#888;">Joined: ${v.joinedAt ? new Date(v.joinedAt.seconds * 1000).toLocaleTimeString() : '-'}</div>`;
                
                const btnGroup = document.createElement('div');
                btnGroup.style.display = 'flex';
                btnGroup.style.gap = '6px';

                const chatBtn = document.createElement('button');
                chatBtn.innerHTML = '<i data-feather="message-circle" style="width:14px; height:14px;"></i>';
                chatBtn.style.cssText = "background:#3498db; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer;";
                chatBtn.onclick = () => switchToChat(`@${v.name} `);

                const kickBtn = document.createElement('button');
                kickBtn.innerText = "Kick";
                kickBtn.style.cssText = "background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem;";
                kickBtn.onclick = () => { if(confirm(`Kick ${v.name}?`)) kickViewer(sessionId, v.id); };
                
                btnGroup.appendChild(chatBtn);
                btnGroup.appendChild(kickBtn);
                row.appendChild(infoDiv);
                row.appendChild(btnGroup);
                list.appendChild(row);
            });
            if (feather) feather.replace();
        });
    };

    const renderChat = (initialText = '') => {
        if (currentUnsubscribe) currentUnsubscribe();
        content.innerHTML = ''; // Clear
        currentUnsubscribe = mountChatUI(content, sessionId, "Host", true, initialText);
    };

    const switchToChat = (text = '') => {
        document.querySelectorAll('#host-dashboard .tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-chat-btn').classList.add('active');
        renderChat(text);
    };

    document.getElementById('tab-viewers-btn').onclick = () => {
        document.querySelectorAll('#host-dashboard .tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-viewers-btn').classList.add('active');
        renderViewers();
    };

    document.getElementById('tab-chat-btn').onclick = () => {
        switchToChat();
    };

    // Clean up on close
    const originalClose = document.getElementById('close-dash').onclick;
    document.getElementById('close-dash').onclick = () => {
        if (currentUnsubscribe) currentUnsubscribe();
        modal.remove();
    };

    // Initial load: Viewers
    renderViewers();
}

function showAutoShareModal(url) {
    const existing = document.getElementById('auto-share-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'auto-share-modal';
    modal.style.cssText = `
        position: fixed; top: 80px; right: 20px; width: 320px;
        background: var(--panel-bg, #fff); border: 1px solid var(--border-color, #ccc);
        border-radius: 12px; padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 2000; display: flex; flex-direction: column; gap: 12px;
        color: var(--text-primary, #000);
    `;

    const msg = encodeURIComponent(`Follow my live location: ${url}`);
    const waLink = `https://wa.me/?text=${msg}`;
    const smsLink = `sms:?&body=${msg}`;

    modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="font-size:1rem; margin:0; font-weight:600;">📡 Share Live Location</h3>
            <button id="close-share-modal" style="background:none; border:none; cursor:pointer; color:var(--text-secondary);"><i data-feather="x"></i></button>
        </div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin:0;">Let others track your ride in real-time.</p>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <a href="${waLink}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; background:#25D366; color:white; text-decoration:none; border-radius:8px; font-weight:600; font-size:0.9rem;">
                <i data-feather="message-circle" style="width:16px; height:16px;"></i> WhatsApp
            </a>
            <a href="${smsLink}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; background:#3498db; color:white; text-decoration:none; border-radius:8px; font-weight:600; font-size:0.9rem;">
                <i data-feather="message-square" style="width:16px; height:16px;"></i> SMS
            </a>
            <button id="copy-share-link-btn" style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; background:#f1c40f; color:#212121; border:none; border-radius:8px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <i data-feather="copy" style="width:16px; height:16px;"></i> Copy Link
            </button>
        </div>
    `;

    document.body.appendChild(modal);
    if (feather) feather.replace();

    document.getElementById('close-share-modal').onclick = () => modal.remove();
    document.getElementById('copy-share-link-btn').onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.getElementById('copy-share-link-btn');
            btn.innerHTML = `<i data-feather="check" style="width:16px; height:16px;"></i> Copied!`;
            setTimeout(() => {
                btn.innerHTML = `<i data-feather="copy" style="width:16px; height:16px;"></i> Copy Link`;
                if (feather) feather.replace();
            }, 2000);
            if (feather) feather.replace();
        });
    };
    
    // Auto-close after 15s
    setTimeout(() => {
        if (document.body.contains(modal)) modal.remove();
    }, 15000);
}

function removeFavorite(index) {
    let favs = getFavorites();
    favs.splice(index, 1);
    localStorage.setItem('location_favorites', JSON.stringify(favs));
    loadFavoritesList();
    updateStarButtons();
}

function updateStarButtons() {
    const favs = getFavorites();
    document.querySelectorAll('.star-btn').forEach((btn, i) => {
        const feature = currentFeatures[i];
        if (feature) {
            const isFav = favs.some(f => f.place_name === feature.place_name);
            btn.classList.toggle('active', isFav);
            btn.innerHTML = isFav ? `<i data-feather="star" fill="currentColor"></i>` : `<i data-feather="star"></i>`;
        } else {
             btn.classList.remove('active');
             btn.innerHTML = `<i data-feather="star"></i>`;
        }
    });
    if (feather) feather.replace();
}
