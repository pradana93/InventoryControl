import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AUTH_EMAILS: Record<string, 'super-admin' | 'manager' | 'operator'> = {
  'majestap93@gmail.com': 'super-admin',
};

function getRole(email: string): 'super-admin' | 'manager' | 'operator' {
  return AUTH_EMAILS[email.toLowerCase()] || 'operator';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authOptions: any = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text', placeholder: 'masuk@inventory.id' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: any) {
        const email = credentials?.email?.toLowerCase().trim();
        
        if (!email || !AUTH_EMAILS[email]) {
          throw new Error('Email tidak terdaftar. Hubungi Super Admin.');
        }

        return {
          id: email,
          name: email.split('@')[0],
          email,
          role: getRole(email),
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }: any) {
      if (token?.role && session.user) {
        session.user.role = token.role;
      }
      return session;
    },
    async jwt({ token, user }: any) {
      if (user?.role) {
        token.role = user.role;
      }
      return token;
    },
    async signIn({ user }: any) {
      const email = user.email?.toLowerCase();
      return !!email && !!AUTH_EMAILS[email];
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };