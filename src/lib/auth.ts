import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { authenticateUser } from '@/lib/user-service';

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
        email: { label: 'Email', type: 'text', placeholder: 'nama@inventory.id' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: any) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;

        if (!email || !password) {
          throw new Error('Email dan kata sandi wajib diisi.');
        }

        const result = await authenticateUser(email, password);
        if (!result) {
          throw new Error('Email atau kata sandi salah.');
        }

        return {
          id: result.user.email,
          name: result.user.name || result.user.email,
          email: result.user.email,
          role: result.user.role,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }: any) {
      if (token?.role && session.user) {
        session.user.role = token.role;
      }
      if (token?.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }: any) {
      if (user?.role) {
        token.role = user.role;
      }
      return token;
    },
    async signIn({ user, account }: any) {
      // Google OAuth: only allow existing users in the Users sheet
      if (account?.provider === 'google') {
        const { getUsers } = await import('@/lib/user-service');
        const users = await getUsers();
        const email = user.email?.toLowerCase();
        const exists = users.some((u) => u.email.toLowerCase() === email);
        if (!exists) return false;
      }
      return true;
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
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);