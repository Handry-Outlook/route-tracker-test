import { X_WEATHER_ID, X_WEATHER_SECRET } from './config.js';
const BASE_URL='https://data.api.xweather.com/conditions';
export async function fetchWindAtLocation(lat,lon,timestamp=null){
  if(X_WEATHER_ID&&X_WEATHER_SECRET){
    let url=`${BASE_URL}/${lat},${lon}?client_id=${encodeURIComponent(X_WEATHER_ID)}&client_secret=${encodeURIComponent(X_WEATHER_SECRET)}&units=metric`;
    if(timestamp){const ts=timestamp instanceof Date?Math.floor(timestamp.getTime()/1000):timestamp;url+=`&for=${ts}`}
    try{const response=await fetch(url);if(!response.ok)throw new Error(`Xweather ${response.status}`);const data=await response.json(),current=data?.response?.[0]?.periods?.[0];if(!data?.success||!current)throw new Error('No Xweather conditions');return{time:current.timestamp,speed:current.windSpeedMPS,bearing:current.windDirDEG,gust:current.windGustMPS,temp:current.tempC,feelsLike:current.feelslikeC,humidity:current.humidity,desc:current.weatherPrimary,icon:current.icon,source:'Xweather'}}catch(error){console.warn('Xweather failed; using Open-Meteo fallback',error)}
  }
  try{const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=auto`,data=await fetch(url).then(r=>{if(!r.ok)throw new Error(`Open-Meteo ${r.status}`);return r.json()}),c=data.current;return{time:Math.floor(new Date(c.time).getTime()/1000),speed:c.wind_speed_10m,bearing:c.wind_direction_10m,gust:c.wind_gusts_10m,temp:c.temperature_2m,feelsLike:c.apparent_temperature,humidity:c.relative_humidity_2m,desc:weatherCodeDescription(c.weather_code),icon:weatherCodeIcon(c.weather_code,new Date(c.time).getHours()),code:c.weather_code,source:'Open-Meteo'}}catch(error){console.error('Weather fetch failed',error);return null}
}
/* Short-lived response cache. Replanning a route nudges its coordinates only
   slightly, and Open-Meteo's grid is a kilometre or more, so rounding to ~1 km
   and the hour loses nothing while turning repeated replans into cache hits. */
const forecastCache=new Map();
const FORECAST_TTL_MS=20*60*1000;
async function cachedJson(url){
  const hit=forecastCache.get(url);
  if(hit&&Date.now()-hit.at<FORECAST_TTL_MS)return hit.data;
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Open-Meteo ${response.status}`);
  const data=await response.json();
  forecastCache.set(url,{at:Date.now(),data});
  if(forecastCache.size>60)forecastCache.delete(forecastCache.keys().next().value);
  return data;
}

/**
 * Weather at points along a route, each for the time the rider reaches it.
 *
 * This used to make one request per point — twelve per route, for every route,
 * on every replan — which got the app rate-limited by Open-Meteo (HTTP 429).
 * It also asked for CURRENT conditions and ignored each point's timestamp, so a
 * three-hour ride was forecast as though every kilometre were ridden right now.
 * Open-Meteo accepts many locations in one call, so this is now a single
 * request for the hourly forecast at every point, reading the hour nearest to
 * when the rider arrives. The result is aligned index-for-index with points,
 * null where a location is missing, so callers never pair a value with the
 * wrong place.
 */
export async function fetchRouteForecast(points){
  const pts=(points||[]).map(p=>({...p,lat:+p.lat,lon:+p.lon}));
  if(!pts.length)return[];
  if(X_WEATHER_ID&&X_WEATHER_SECRET){
    const results=await Promise.all(pts.map(p=>fetchWindAtLocation(p.lat,p.lon,p.time)));
    return results;
  }
  const lat=pts.map(p=>p.lat.toFixed(2)).join(',');
  const lon=pts.map(p=>p.lon.toFixed(2)).join(',');
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&forecast_days=3&timeformat=unixtime&timezone=UTC`;
  let data;
  try{data=await cachedJson(url)}
  catch(error){console.warn('Route forecast unavailable',error);return pts.map(()=>null)}
  const list=Array.isArray(data)?data:[data];
  return pts.map((p,i)=>{
    const h=list[i]?.hourly;
    if(!h?.time?.length)return null;
    const target=Math.floor((p.time instanceof Date?p.time.getTime():(Number.isFinite(p.time)?p.time*1000:Date.now()))/1000);
    let k=0,best=Infinity;
    for(let j=0;j<h.time.length;j++){const d=Math.abs(h.time[j]-target);if(d<best){best=d;k=j}}
    return{time:h.time[k],speed:h.wind_speed_10m[k],bearing:h.wind_direction_10m[k],gust:h.wind_gusts_10m[k],
      temp:h.temperature_2m[k],feelsLike:h.apparent_temperature[k],humidity:h.relative_humidity_2m[k],
      desc:weatherCodeDescription(h.weather_code[k]),icon:weatherCodeIcon(h.weather_code[k],new Date(h.time[k]*1000).getHours()),
      code:h.weather_code[k],source:'Open-Meteo'};
  });
}
export async function fetchHourlyForecast(lat,lon,hours=72){
  if(X_WEATHER_ID&&X_WEATHER_SECRET){try{const now=Math.floor(Date.now()/1000),to=now+hours*3600,url=`${BASE_URL}/${lat},${lon}?client_id=${encodeURIComponent(X_WEATHER_ID)}&client_secret=${encodeURIComponent(X_WEATHER_SECRET)}&units=metric&from=${now}&to=${to}&limit=${hours}`,response=await fetch(url);if(response.ok){const data=await response.json(),periods=data?.response?.[0]?.periods||[];if(periods.length)return periods.slice(0,hours).map(p=>({time:p.timestamp,temp:p.tempC,feelsLike:p.feelslikeC,humidity:p.humidity,precip:p.precipMM??0,probability:p.pop??0,speed:p.windSpeedMPS,bearing:p.windDirDEG,gust:p.windGustMPS,desc:p.weatherPrimary,icon:p.icon,source:'Xweather'}))}}catch(e){console.warn('Xweather hourly failed',e)}}
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&forecast_days=4&timezone=auto`,d=await fetch(url).then(r=>r.json());return d.hourly.time.slice(0,hours).map((time,i)=>({time:Math.floor(new Date(time).getTime()/1000),temp:d.hourly.temperature_2m[i],feelsLike:d.hourly.apparent_temperature[i],humidity:d.hourly.relative_humidity_2m[i],probability:d.hourly.precipitation_probability[i],precip:d.hourly.precipitation[i],speed:d.hourly.wind_speed_10m[i],bearing:d.hourly.wind_direction_10m[i],gust:d.hourly.wind_gusts_10m[i],desc:weatherCodeDescription(d.hourly.weather_code[i]),icon:weatherCodeIcon(d.hourly.weather_code[i],new Date(time).getHours()),code:d.hourly.weather_code[i],source:'Open-Meteo'}))
}
export function cardinalDirection(deg){if(!Number.isFinite(deg))return'Unknown';return['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((deg%360)+360)%360/22.5)%16]}
function weatherCodeDescription(c){return c===0?'Clear':c<4?'Partly cloudy':c<50?'Fog':c<70?'Rain':c<80?'Snow':c<90?'Showers':'Thunderstorm'}

function weatherCodeIcon(c,hour=12){const night=hour<6||hour>=20,n=night?'n':'';if(c===0)return night?'clearn.png':'sunny.png';if(c<=2)return `pcloudy${n}.png`;if(c===3)return `cloudy${n}.png`;if(c<=48)return `fog${n}.png`;if(c<=57)return `drizzle${n}.png`;if(c<=67)return `rain${n}.png`;if(c<=77)return `snow${n}.png`;if(c<=82)return `showers${n}.png`;if(c<=86)return `snowshowers${n}.png`;return `tstorm${n}.png`}
