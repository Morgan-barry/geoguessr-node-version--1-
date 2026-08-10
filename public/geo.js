// geo.js
// Geolocation helper functions - distance calculation and reverse geocoding.

// Haversine formula to calculate distance between two lat/lng points in kilometers.
// Used for precision mode to calculate the score.
function haversine(lat1, lon1, lat2, lon2) {
    let latDistance = (lat2 - lat1) * Math.PI / 180;
    let lonDistance = (lon2 - lon1) * Math.PI / 180;
    lat1 = lat1 * Math.PI / 180;
    lat2 = lat2 * Math.PI / 180;
    let a = Math.pow(Math.sin(latDistance / 2), 2) + Math.pow(Math.sin(lonDistance / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
    let c = 2 * Math.asin(Math.sqrt(a));
    let Rad = 6371; // Radius of earth in kilometers
    return Rad * c;
}

// Nominatim reverse geocode function to get the country and country code.
// Country code is used for checking the answer and revealing clues.
// Country name is for displaying in the modal and clues.
async function reverseGeocodeCountry(lat, lon) {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`);
    const data = await res.json();

    // If no address or country information is found, return null values
    if (!data) {
        return { country: null, country_code: null };
    }

    // Return the country and iso country code
    // the return is in an object format with properties country and country_code for easy access in other functions
    return {
        country: data.address.country,
        country_code: data.address.country_code
    };
}