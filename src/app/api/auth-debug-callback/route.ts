import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const response = await handlers.POST(request);
    
    // Log the response details
    const headers = Object.fromEntries(response.headers.entries());
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    
    console.log('Auth callback response:', {
      status: response.status,
      headers,
      cookies,
      redirected: response.redirected,
      url: response.url
    });
    
    return response;
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.json(
      { error: 'Auth handler error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}