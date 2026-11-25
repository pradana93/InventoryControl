import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: 'super-admin' | 'manager' | 'operator'; // Custom role property
    };
  }

  interface User {
    role?: 'super-admin' | 'manager' | 'operator'; // Custom role property for initial user object
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: 'super-admin' | 'manager' | 'operator'; // Custom role property for JWT
  }
}
