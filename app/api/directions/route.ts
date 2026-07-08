import { NextRequest, NextResponse } from 'next/server';

const ORS_API_KEY = process.env.OPENROUTESERVICE_API_KEY;
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

export async function POST(request: NextRequest) {
  try {
    const { startLng, startLat, endLng, endLat } = await request.json();

    if (!startLng || !startLat || !endLng || !endLat) {
      return NextResponse.json(
        { error: 'Missing coordinates' },
        { status: 400 }
      );
    }

    if (!ORS_API_KEY) {
      return NextResponse.json(
        { error: 'OpenRouteService API key not configured' },
        { status: 500 }
      );
    }

    // Build query params: start and end as lng,lat
    const start = `${startLng},${startLat}`;
    const end = `${endLng},${endLat}`;
    const url = `${ORS_URL}?start=${start}&end=${end}&format=json`;

    const response = await fetch(url, {
      headers: {
        Authorization: ORS_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ORS API error:', errorText);
      return NextResponse.json(
        { error: 'OpenRouteService request failed' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract distance (meters) and duration (seconds)
    const features = data.features;
    if (!features || features.length === 0) {
      return NextResponse.json(
        { error: 'No route found' },
        { status: 404 }
      );
    }

    const route = features[0];
    const properties = route.properties;
    const distance_meters = properties.summary.distance; // in meters
    const duration_seconds = properties.summary.duration; // in seconds
    const route_summary = `Driving via ${properties.summary?.distance ? 'route' : 'unknown'}`;

    // Optionally, we could extract the geometry for polyline, but we'll just store summary.

    return NextResponse.json({
      distance_meters,
      duration_seconds,
      route_summary,
    });
  } catch (error: any) {
    console.error('Route API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}