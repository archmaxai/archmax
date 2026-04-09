import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Input, Label } from "@archmax/ui";
import { authClient } from "@/lib/auth-client";
import { GradientBackground } from "@/components/ui/gradient-background";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await authClient.signIn.username({
        username,
        password,
      });

      if (authError) {
        setError("Invalid username or password");
        return;
      }

      navigate({ to: "/" });
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center">
      <GradientBackground />

      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card/80 backdrop-blur-xl p-8 shadow-popup">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">archmax</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to the admin panel</p>
        </div>
        <form onSubmit={handleSubmit} className="content-group">
          <div className="content-tight">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="content-tight">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
