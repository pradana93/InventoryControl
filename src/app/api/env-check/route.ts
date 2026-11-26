import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasAuthSecret: !!process.env.AUTH_SECRET,
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    nextAuthUrl: process.env.NEXTAUTH_URL,
    envKeys: Object.keys(process.env).filter(k => k.includes('AUTH'))
  });
}