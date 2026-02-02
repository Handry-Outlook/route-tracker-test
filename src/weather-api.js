// src/weather-api.js
import { X_WEATHER_ID, X_WEATHER_SECRET } from './config.js';

const BASE_URL = 'https://data.api.xweather.com/observations';

/**
 * Fetches current wind data from X Weather
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} - { speedMPS, bearing, gustMPS }
 */
export const fetchWindAtLocation = async (lat, lon) => {
    // X Weather format: "lat,lon"
    const locationQuery = `${lat},${lon}`;
    
    // Construct URL with credentials
    // Note: We request 'metric' units (m/s, celcius) specifically
    const url = `${BASE_URL}/${locationQuery}?client_id=${X_WEATHER_ID}&client_secret=${X_WEATHER_SECRET}&units=metric`;

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`X Weather API Error: ${response.status}`);
        }

        const data = await response.json();

        // X Weather response structure is data.response.ob
        if (!data.success || !data.response) {
            throw new Error('No weather data found for this location');
        }

        const observation = data.response.ob;

        // Return ONLY what Handry Outlook needs (Clean Data)
        return {
            speed: observation.windSpeedMPS, // Meters per second (good for physics math)
            bearing: observation.windDirDEG, // Degrees (0-360) for your Turf.js logic
            gust: observation.windGustMPS,
            temp: observation.tempC,         // Bonus: Temp for clothing advice
            desc: observation.weatherPrimary // e.g., "Partly Cloudy"
        };

    } catch (error) {
        console.error("Weather Fetch Failed:", error);
        return null; // Handle null gracefully in your UI
    }
};