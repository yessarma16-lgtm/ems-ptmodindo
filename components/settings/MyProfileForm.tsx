"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { User } from "@/lib/user-service";

export function MyProfileForm({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.issues) {
          const flat: Record<string, string> = {};
          Object.entries(data.issues as Record<string, string[]>).forEach(([k, v]) => {
            if (v?.[0]) flat[k] = v[0];
          });
          setErrors(flat);
        }
        toast.error(data.error ?? "Failed to save profile.");
        return;
      }
      toast.success("Profile updated.");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setChangingPassword(true);
    setPasswordError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error ?? "Failed to update password.");
        return;
      }
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Role: <Badge variant="outline">{user.role}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="max-w-md space-y-4">
            <div>
              <Label htmlFor="profile-name" className="mb-1.5 block">
                Name
              </Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>
            <div>
              <Label htmlFor="profile-username" className="mb-1.5 block">
                Username
              </Label>
              <Input id="profile-username" value={username} onChange={(e) => setUsername(e.target.value)} />
              {errors.username && <p className="mt-1 text-xs text-destructive">{errors.username}</p>}
            </div>
            <div>
              <Label htmlFor="profile-email" className="mb-1.5 block">
                Email
              </Label>
              <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4" />
            Change Password
          </CardTitle>
          <CardDescription>Sign-in password for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
            <div>
              <Label htmlFor="current-password" className="mb-1.5 block">
                Current Password
              </Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <Label htmlFor="new-password" className="mb-1.5 block">
                New Password
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
            <Button type="submit" disabled={changingPassword || !currentPassword || !newPassword}>
              {changingPassword ? <Loader2 className="animate-spin" /> : <Lock />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
