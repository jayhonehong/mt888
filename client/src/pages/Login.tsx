import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Icon, Spinner } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

export function Login() {
  const { login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      push({ title: 'Signed in', body: 'Your gold beans are waiting.', tone: 'win' });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign you in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep your gold beans, your slip history and your place on the leaderboard."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-gold-400 hover:text-gold-300">
            Create one in ten seconds
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="label mb-1.5 block" htmlFor="identifier">
            Username or email
          </label>
          <input
            id="identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            placeholder="your username or email"
            className="field"
            required
          />
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            className="field"
            required
          />
        </div>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-down-400/30 bg-down-400/10 px-3 py-2 text-[12px] text-down-400">
            <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? <Spinner className="h-4 w-4" /> : null}
          Sign in
        </button>
      </form>

    </AuthLayout>
  );
}
