// src/weather-api.js
import { X_WEATHER_ID, X_WEATHER_SECRET } from './config.js';

const BASE_URL = 'https://data.api.xweather.com/conditions';

/**
 * Fetches current weather conditions from X Weather
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Date|number} [timestamp] - Optional time for forecast (Date object or Unix seconds)
 * @returns {Promise<Object>}
 */
export const fetchWindAtLocation = async (lat, lon, timestamp = null) => {
    // X Weather format: "lat,lon"
    const locationQuery = `${lat},${lon}`;
    
    // Construct URL with credentials
    // Note: We request 'metric' units (m/s, celcius) specifically
    let url = `${BASE_URL}/${locationQuery}?client_id=${X_WEATHER_ID}&client_secret=${X_WEATHER_SECRET}&units=metric`;

    if (timestamp) {
        // Convert to Unix timestamp (seconds) if it's a Date object
        const ts = timestamp instanceof Date ? Math.floor(timestamp.getTime() / 1000) : timestamp;
        url += `&for=${ts}`;
    }

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`X Weather API Error: ${response.status}`);
        }

        const data = await response.json();

        // X Weather Conditions response structure is data.response[0].periods[0]
        if (!data.success || !data.response || data.response.length === 0) {
            throw new Error('No weather data found for this location');
        }

        const current = data.response[0].periods[0];

        // Return ONLY what Handry Outlook needs (Clean Data)
        return {
            time: current.timestamp, // Unix timestamp
            speed: current.windSpeedMPS, // Meters per second
            bearing: current.windDirDEG, // Degrees (0-360)
            gust: current.windGustMPS,
            temp: current.tempC,
            feelsLike: current.feelslikeC,
            humidity: current.humidity,
            desc: current.weatherPrimary, // e.g., "Partly Cloudy"
            icon: current.icon // e.g., "mcloudy.png"
        };

    } catch (error) {
        console.error("Weather Fetch Failed:", error);
        return null; // Handle null gracefully in your UI
    }
};

/**
 * Fetches weather for multiple points along a route
 * @param {Array} points - Array of {lat, lon, time} objects
 */
export const fetchRouteForecast = async (points) => {
    // Xweather allows batching, but for simplicity and to match the existing single-point logic
    // we will use Promise.all. If points > 10, we might want to batch or limit.
    // The 'route' endpoint exists but requires specific formatting.
    
    const promises = points.map(pt => fetchWindAtLocation(pt.lat, pt.lon, pt.time));
    
    try {
        const results = await Promise.all(promises);
        return results.filter(r => r !== null);
    } catch (e) {
        console.error("Route Forecast Error:", e);
        return [];
    }
};