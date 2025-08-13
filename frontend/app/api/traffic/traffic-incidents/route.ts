import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const bbox = searchParams.get('bbox');
  const language = searchParams.get('language') || 'en-GB';
  const timeValidityFilter = searchParams.get('timeValidityFilter') || 'present';

  if (!bbox) {
    return Response.json({ error: 'bbox parameter is required' }, { status: 400 });
  }

  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const params = new URLSearchParams({
      bbox,
      language,
      timeValidityFilter,
    });

    const response = await fetch(`${backendUrl}/api/traffic/traffic-incidents?${params}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend API error:', response.status, errorText);
      return Response.json(
        { error: 'Failed to fetch traffic incidents', details: errorText }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return Response.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}