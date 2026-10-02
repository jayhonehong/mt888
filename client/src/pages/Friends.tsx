import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { FriendsState } from '../lib/types';
import { beans } from '../lib/format';
import { Avatar, Badge, BeanIcon, EmptyState, Panel, SectionHeader } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const emptyState: FriendsState = { friends: [], requests: [], sent: [] };

type SearchUser = { id: number; username: string; avatarHue: number; role: string; relationship: 'none' | 'friend' | 'incoming' | 'outgoing' };

export function Friends() {
  const { setBalance } = useAuth();
  const { push } = useToast();
  const [state, setState] = useState<FriendsState>(emptyState);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setState(await api.friends());
    } catch (error) {
      push({ title: 'Could not load friends', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) { setResults([]); return undefined; }
    const timer = window.setTimeout(() => {
      void api.searchPlayers(clean).then((payload) => setResults(payload.users)).catch(() => setResults([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function request(username: string) {
    setBusy(`request:${username}`);
    try {
      const payload = await api.sendFriendRequest(username);
      push({ title: payload.status === 'accepted' ? 'Friend added' : 'Request sent', body: `${username} is now in your social orbit.`, tone: 'win' });
      setQuery(''); setResults([]); await load();
    } catch (error) {
      push({ title: 'Could not add player', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' });
    } finally { setBusy(null); }
  }

  async function answer(id: number, action: 'accept' | 'decline') {
    setBusy(`${action}:${id}`);
    try {
      await api.answerFriendRequest(id, action);
      push({ title: action === 'accept' ? 'Friend request accepted' : 'Request declined', body: action === 'accept' ? 'You can now gift beans to each other.' : 'The request was removed.', tone: action === 'accept' ? 'win' : 'info' });
      await load();
    } catch (error) { push({ title: 'Could not update request', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' }); }
    finally { setBusy(null); }
  }

  async function gift(username: string) {
    const amount = Math.trunc(Number(amounts[username] ?? 0));
    if (amount <= 0) { push({ title: 'Enter a gift amount', body: 'Choose a positive whole number of beans.', tone: 'info' }); return; }
    setBusy(`gift:${username}`);
    try {
      const payload = await api.giftBeans(username, amount);
      setBalance(payload.balance);
      setAmounts((current) => ({ ...current, [username]: '' }));
      push({ title: 'Beans gifted', body: `${beans(payload.gifted)} beans sent to ${username}.`, tone: 'win' });
    } catch (error) { push({ title: 'Gift failed', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' }); }
    finally { setBusy(null); }
  }

  return <div className="space-y-5">
    <SectionHeader title="Friends" subtitle="Find players, build your circle, and share fictional Gold Beans." />

    <Panel className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="label">Player search</p><h1 className="display mt-1 text-3xl font-bold uppercase text-mist-100">Find your crew</h1></div><Badge tone="gold">Social</Badge></div>
      <div className="relative mt-5"><input value={query} onChange={(event) => setQuery(event.target.value)} className="field" placeholder="Search by exact or partial username" aria-label="Find a player" />{results.length ? <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">{results.map((player) => <div key={player.id} className="flex items-center gap-3 border-b border-ink-800 px-3 py-3 last:border-0"><Avatar name={player.username} hue={player.avatarHue} size={34} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-mist-100">{player.username}</p><p className="text-[11px] text-mist-500">{player.role}</p></div>{player.relationship === 'friend' ? <Badge tone="up">Friend</Badge> : player.relationship === 'outgoing' ? <Badge tone="neutral">Pending</Badge> : player.relationship === 'incoming' ? <Badge tone="info">Incoming</Badge> : <button type="button" disabled={busy === `request:${player.username}`} onClick={() => void request(player.username)} className="btn btn-ghost text-[11px]">{busy === `request:${player.username}` ? 'Sending…' : 'Add friend'}</button>}</div>)}</div> : null}</div>
      {!query.trim() ? <p className="mt-3 text-xs text-mist-500">Type at least two characters to search the player directory.</p> : null}
    </Panel>

    {state.requests.length ? <Panel className="p-5 sm:p-6"><SectionHeader title="Friend requests" subtitle="Players waiting for your reply." /> <div className="mt-4 space-y-2">{state.requests.map((request) => <div key={request.requestId} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-950/40 p-3"><Avatar name={request.user.username} hue={request.user.avatarHue} size={34} /><span className="flex-1 text-sm font-semibold text-mist-100">{request.user.username}</span><button type="button" disabled={busy === `accept:${request.requestId}`} onClick={() => void answer(request.requestId, 'accept')} className="btn bg-up-400 text-ink-950 text-[11px]">Accept</button><button type="button" disabled={busy === `decline:${request.requestId}`} onClick={() => void answer(request.requestId, 'decline')} className="btn btn-ghost text-[11px]">Decline</button></div>)}</div></Panel> : null}

    <Panel className="p-5 sm:p-6"><SectionHeader title="Your friends" subtitle="Accepted friends can gift beans to one another." />{loading ? <p className="mt-5 text-sm text-mist-500">Loading your circle…</p> : state.friends.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{state.friends.map((friend) => <div key={friend.friendshipId} className="rounded-xl border border-ink-700 bg-ink-950/40 p-4"><div className="flex items-center gap-3"><Avatar name={friend.user.username} hue={friend.user.avatarHue} size={38} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-mist-100">{friend.user.username}</p><p className="text-[11px] text-mist-500">Ready to receive beans</p></div><Badge tone="up">Friend</Badge></div><div className="mt-4 flex gap-2"><div className="relative flex-1"><BeanIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" /><input aria-label={`Gift amount to ${friend.user.username}`} value={amounts[friend.user.username] ?? ''} onChange={(event) => setAmounts((current) => ({ ...current, [friend.user.username]: event.target.value }))} type="number" min={1} step={1} className="field pl-9" placeholder="Beans" /></div><button type="button" disabled={busy === `gift:${friend.user.username}`} onClick={() => void gift(friend.user.username)} className="btn btn-primary">{busy === `gift:${friend.user.username}` ? 'Sending…' : 'Gift'}</button></div></div>)}</div> : <div className="mt-4"><EmptyState title="No friends yet" body="Search for a player above and send your first friend request." /></div>}</Panel>

    {state.sent.length ? <p className="text-center text-xs text-mist-500">{state.sent.length} outgoing request{state.sent.length === 1 ? '' : 's'} waiting for a reply.</p> : null}
  </div>;
}
