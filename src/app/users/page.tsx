'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2, UserPlus, Shield, Users, ChevronDown, Save, X } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface User {
  email: string;
  name: string;
  role: 'super-admin' | 'manager' | 'operator';
  createdAt: string;
  createdBy: string;
}

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Add user modal state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'super-admin' | 'manager' | 'operator'>('operator');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit role state
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'super-admin' | 'manager' | 'operator'>('operator');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const addToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Gagal memuat pengguna');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      addToast('error', 'Gagal memuat daftar pengguna');
      console.error('Fetch users error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      // Check if user is Super Admin
      if (session?.user?.role !== 'super-admin') {
        router.push('/');
        return;
      }
      fetchUsers();
    } else if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [session, status, router, fetchUsers]);

  // Handle add user
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddLoading(true);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          name: newName.trim(),
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat pengguna');

      addToast('success', 'Pengguna berhasil dibuat');
      setAddDialogOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('operator');
      fetchUsers();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Gagal membuat pengguna');
      addToast('error', error instanceof Error ? error.message : 'Gagal membuat pengguna');
    } finally {
      setAddLoading(false);
    }
  };

// Handle edit role
  const handleEditRole = async (email: string, role: string) => {
    const validRole = role as 'super-admin' | 'manager' | 'operator';
    setEditEmail(email);
    setEditRole(validRole);
    setEditError(null);
    setEditLoading(true);

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: validRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui role');

      addToast('success', 'Role pengguna berhasil diperbarui');
      fetchUsers();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Gagal memperbarui role');
      addToast('error', error instanceof Error ? error.message : 'Gagal memperbarui role');
    } finally {
      setEditLoading(false);
    }
  };

  // Role badge component
  const getRoleBadge = (role: string) => {
    const badges = {
      'super-admin': 'bg-purple-100 text-purple-800 border-purple-200',
      'manager': 'bg-blue-100 text-blue-800 border-blue-200',
      'operator': 'bg-green-100 text-green-800 border-green-200',
    };
    const labels = {
      'super-admin': 'Super Admin',
      'manager': 'Manager',
      'operator': 'Operator',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badges[role as keyof typeof badges] || badges.operator}`}>
        {labels[role as keyof typeof labels] || role}
      </span>
    );
  };

  // Don't render anything until session is loaded
  if (status === 'loading') {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Redirect non-super-admins (handled in useEffect, but fallback)
  if (!session?.user?.email || session.user.role !== 'super-admin') {
    return null;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Toasts */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg shadow-lg border min-w-[350px] max-w-md ${
              t.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            {t.type === 'success' ? (
              <Shield className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <X className="h-5 w-5 flex-shrink-0 mt-0.5 text-destructive" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{t.message}</p>
            </div>
            <button onClick={() => removeToast(t.id)} className="ml-2 opacity-50 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Manajemen Pengguna
          </h1>
          <p className="text-muted-foreground mt-1">
            Kelola akun pengguna, role, dan akses sistem (hanya Super Admin)
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Tambah Pengguna
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Tambah Pengguna Baru</DialogTitle>
              <DialogDescription>
                Isi data pengguna baru. Password minimal 6 karakter. Role menentukan hak akses di sistem.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nama@domain.com"
                  required
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-name">Nama Lengkap <span className="text-destructive">*</span></Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nama lengkap pengguna"
                  required
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Password <span className="text-destructive">*</span></Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  required
                  minLength={6}
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role <span className="text-destructive">*</span></Label>
                <Select value={newRole} onValueChange={(val) => setNewRole(val as 'super-admin' | 'manager' | 'operator')} disabled={addLoading}>
                  <SelectTrigger id="new-role">
                    <SelectValue placeholder="Pilih role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator - Akses operasional (Inbound, Outbound, Opname)</SelectItem>
                    <SelectItem value="manager">Manager - Akses manajemen + laporan</SelectItem>
                    <SelectItem value="super-admin">Super Admin - Akses penuh termasuk manajemen pengguna</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {addError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                  {addError}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addLoading}>
                  Batal
                </Button>
                <Button type="submit" disabled={addLoading}>
                  {addLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {addLoading ? 'Menyimpan...' : 'Simpan Pengguna'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* User List Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Daftar Pengguna ({users.length})
            <span className="text-sm font-normal text-muted-foreground">Klik role untuk mengubah</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Belum ada pengguna. Klik "Tambah Pengguna" untuk memulai.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="w-48">Role</TableHead>
                    <TableHead className="w-48">Dibuat Pada</TableHead>
                    <TableHead className="w-48">Dibuat Oleh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.email} className="hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{user.email}</TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(newRole) => handleEditRole(user.email, newRole as 'super-admin' | 'manager' | 'operator')}
                          disabled={editLoading && editEmail === user.email}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder={user.role} />
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="operator">Operator</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="super-admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        {editLoading && editEmail === user.email && (
                          <Loader2 className="absolute h-4 w-4 animate-spin text-primary ml-2" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.createdAt ? format(new Date(user.createdAt), 'dd MMM yyyy HH:mm', { locale: id }) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{user.createdBy || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Panduan Role & Hak Akses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-purple-200 bg-purple-50">
              <h4 className="font-semibold text-purple-800 flex items-center gap-2">
                <Shield className="h-4 w-4" /> Super Admin
              </h4>
              <ul className="text-sm text-purple-700 mt-2 space-y-1">
                <li>• Akses penuh ke semua fitur</li>
                <li>• Manajemen pengguna (tambah, hapus, ubah role)</li>
                <li>• Konfigurasi sistem</li>
                <li>• Semua hak Manager & Operator</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                <Users className="h-4 w-4" /> Manager
              </h4>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                <li>• Dashboard & laporan stok</li>
                <li>• Stock Opname (verifikasi)</li>
                <li>• Inbound & Outbound</li>
                <li>• Label rak & QR generator</li>
                <li>• Semua hak Operator</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border border-green-200 bg-green-50">
              <h4 className="font-semibold text-green-800 flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Operator
              </h4>
              <ul className="text-sm text-green-700 mt-2 space-y-1">
                <li>• Inbound scan (mobile)</li>
                <li>• Outbound & Picking List</li>
                <li>• Stock Opname (input count)</li>
                <li>• Print label rak</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}