import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { BeanIcon, Icon, Spinner } from '../components/ui';
import { ApiError } from '../lib/api';
import { beans } from '../lib/format';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

export function Register() {
  const { register } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const bonus = await register(email.trim(), username.trim(), password);
      push({
        title: `${beans(bonus)} beans credited`,
        body: 'Welcome bonus posted to your new ledger.',
        tone: 'win',
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Open an account"
      subtitle="Your beans live on the server against your login, so your balance, slip history and statement survive a refresh."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-gold-400 hover:text-gold-300">
            Sign in instead
          </Link>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-gold-500/25 bg-gold-500/[0.08] px-3 py-2.5">
        <BeanIcon className="h-4 w-4 shrink-0" />
        <p className="text-[11.5px] text-gold-300">
          New accounts are credited <span className="font-bold">1,000 gold beans</span> from the house faucet.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="label mb-1.5 block" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className="field"
            required
          />
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="3-20 letters, numbers or underscores"
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
            autoComplete="new-password"
            placeholder="At least 8 characters"
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
          Create account
        </button>
      </form>

      <p className="mt-3.5 text-[10px] leading-relaxed text-mist-500">
        Passwords are hashed with bcrypt and sessions are signed JWTs. No payment details are ever requested, because
        this build has no payment system to attach them to.
      </p>
    </AuthLayout>
  );
}
