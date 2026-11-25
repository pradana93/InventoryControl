import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

// @ts-expect-error - NextAuth v5 handler type compatibility with Next.js 16
export const GET = handler.GET;

// @ts-expect-error - NextAuth v5 handler type compatibility with Next.js 16
export const POST = handler.POST;