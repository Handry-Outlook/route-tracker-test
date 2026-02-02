// Secret Sauce: Wind vs. Route Direction
export const calculateWindImpact = (segmentBearing, windDirection) => {
    // Relative angle: Difference between where you're going and where wind is coming FROM
    // We add 180 to windDirection because wind is reported as "From", we want "Towards"
    let diff = Math.abs(segmentBearing - ((windDirection + 180) % 360));
    if (diff > 180) diff = 360 - diff;

    if (diff < 45) return 'tailwind';    // Pushing you
    if (diff > 135) return 'headwind';  // Fighting you
    return 'crosswind';                 // Side pressure
};