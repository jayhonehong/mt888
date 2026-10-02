import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Panel, Spinner } from './components/ui';
import { Admin } from './pages/Admin';
import { EventDetail } from './pages/EventDetail';
import { Home } from './pages/Home';
import { Leaderboard } from './pages/Leaderboard';
import { Login } from './pages/Login';
import { MyBets } from './pages/MyBets';
import { NotFound } from './pages/NotFound';
import { Register } from './pages/Register';
import { Sports } from './pages/Sports';
import { Wallet } from './pages/Wallet';
import { Casino } from './pages/Casino';
import { Friends } from './pages/Friends';
import { Rewards } from './pages/Rewards';
import { useAuth } from './state/AuthContext';

function Loading() {
  return (
    <Panel className="flex items-center justify-center gap-3 py-20 text-mist-400">
      <Spinner className="h-5 w-5" />
      <span className="text-[13px]">Loading your session…</span>
    </Panel>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== 'admin') {
    return (
      <Panel className="p-6 text-center">
        <p className="text-[14px] font-semibold text-mist-100">Admin access required</p>
        <p className="mt-1.5 text-[12px] text-mist-400">
          Sign in with the seeded admin account (admin / goldbean-admin) to operate the simulator.
        </p>
      </Panel>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<AppShell />}>
        <Route index element={<Casino game="aviator" />} />
        <Route path="board" element={<Home />} />
        <Route path="sports" element={<Sports />} />
        <Route path="blackjack" element={<Casino game="blackjack" />} />
        <Route path="event/:id" element={<EventDetail />} />
        <Route
          path="my-bets"
          element={
            <RequireAuth>
              <MyBets />
            </RequireAuth>
          }
        />
        <Route
          path="wallet"
          element={
            <RequireAuth>
              <Wallet />
            </RequireAuth>
          }
        />
        <Route
          path="friends"
          element={
            <RequireAuth>
              <Friends />
            </RequireAuth>
          }
        />
        <Route
          path="rewards"
          element={
            <RequireAuth>
              <Rewards />
            </RequireAuth>
          }
        />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
