'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Mail, Lock } from 'lucide-react';
import Link from 'next/link';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Konfigurasi Server',
    description: 'Terjadi kesalahan konfigurasi di server. Silakan coba lagi nanti atau hubungi Super Admin.',
  },
  CredentialsSignin: {
    title: 'Kredensial Salah',
    description: 'Email atau kata sandi yang Anda masukkan tidak cocok. Silakan coba lagi.',
  },
  AccessDenied: {
    title: 'Akses Ditolak',
    description: 'Akun ini tidak memiliki izin akses. Hubungi Super Admin.',
  },
  Verification: {
    title: 'Verifikasi Gagal',
    description: 'Tautan verifikasi tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.',
  },
  OAuthSignin: {
    title: 'Login OAuth Gagal',
    description: 'Terjadi kesalahan saat login dengan penyedia OAuth. Silakan coba lagi.',
  },
  OAuthCallback: {
    title: 'Callback OAuth Gagal',
    description: 'Terjadi kesalahan pada callback OAuth. Silakan coba lagi.',
  },
  OAuthCreateAccount: {
    title: 'Akun OAuth Gagal Dibuat',
    description: 'Tidak dapat membuat akun melalui OAuth. Silakan hubungi Super Admin.',
  },
  EmailCreateAccount: {
    title: 'Email Create Account Gagal',
    description: 'Tidak dapat membuat akun melalui email. Silakan hubungi Super Admin.',
  },
  Callback: {
    title: 'Callback Error',
    description: 'Terjadi kesalahan pada callback autentikasi. Silakan coba login ulang.',
  },
  EmailSignin: {
    title: 'Email Signin Gagal',
    description: 'Terjadi kesalahan saat mengirim email signin. Silakan coba lagi.',
  },
  Default: {
    title: 'Terjadi Kesalahan',
    description: 'Terjadi kesalahan sistem saat login. Silakan coba lagi nanti.',
  },
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';

  const { title, description } = ERROR_MESSAGES[error] || ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <Card className="w-full max-w-md bg-gray-900 border-gray-800">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <CardTitle className="text-lg text-white">{title}</CardTitle>
          <CardDescription className="text-gray-400">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/login">
            <Button className="w-full" size="lg">
              <Mail className="mr-2 h-4 w-4" />
              Kembali ke Login
            </Button>
          </Link>
          <p className="text-xs text-gray-500 text-center">
            Kode error: <code className="font-mono text-gray-400">{error}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-950">Memuat...</div>}>
      <ErrorContent />
    </Suspense>
  );
}