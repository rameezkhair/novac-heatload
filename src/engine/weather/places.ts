/* city centres for the weather and air-quality downloads, WGS84 */
export const UAE_PLACES: { id: string; label: string; lat: number; lon: number }[] = [
  { id: 'dubai', label: 'Dubai', lat: 25.2048, lon: 55.2708 }, { id: 'abudhabi', label: 'Abu Dhabi', lat: 24.4539, lon: 54.3773 },
  { id: 'sharjah', label: 'Sharjah', lat: 25.3463, lon: 55.4209 }, { id: 'ajman', label: 'Ajman', lat: 25.4052, lon: 55.5136 },
  { id: 'uaq', label: 'Umm Al Quwain', lat: 25.5647, lon: 55.5552 }, { id: 'rak', label: 'Ras Al Khaimah', lat: 25.8007, lon: 55.9762 },
  { id: 'fujairah', label: 'Fujairah', lat: 25.1288, lon: 56.3265 }, { id: 'alain', label: 'Al Ain', lat: 24.2075, lon: 55.7447 },
];
export const placeOf = (location: string) => UAE_PLACES.find(x => x.id === location) || UAE_PLACES[0];
