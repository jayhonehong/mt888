import { useEffect, useState } from 'react';
import { Avatar, BeanIcon, EmptyState, Icon, Panel, SectionHeader, SkeletonRows } from '../components/ui';
import { api } from '../lib/api';
import { beans } from '../lib/format';
import type { Leader } from '../lib/types';
import { useAuth } from '../state/AuthContext';

const MEDALS = ['text-gold-500', 'text-mist-200', 'text-gold-700'];

export function Leaderboard() {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .leaderboard()
        .then((payload) => {
          if (!cancelled) setLeaders(payload.leaders);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    void load();
    const timer = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Bean leaderboard"
        subtitle="Ranked by wallet balance. Beans only exist inside this simulation, so there is nothing to win."
      />

      {loading ? (
        <SkeletonRows rows={5} />
      ) : leaders.length === 0 ? (
        <Panel>
          <EmptyState icon={<Icon name="trophy" className="h-7 w-7" />} title="No players yet" body="Be the first to open an account." />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-ink-700">
                  <th className="label px-3 py-2.5 font-semibold">#</th>
                  <th className="label px-3 py-2.5 font-semibold">Player</th>
                  <th className="label px-3 py-2.5 text-right font-semibold">Balance</th>
                  <th className="label px-3 py-2.5 text-right font-semibold">Slips</th>
                  <th className="label px-3 py-2.5 text-right font-semibold">Won</th>
                  <th className="label px-3 py-2.5 text-right font-semibold">Strike</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((leader) => {
                  const isMe = user?.id === leader.id;
                  const strike = leader.bets ? Math.round((leader.wins / leader.bets) * 100) : 0;
                  return (
                    <tr
                      key={leader.id}
                      className={`border-b border-ink-800/70 last:border-0 ${isMe ? 'bg-gold-500/[0.06]' : 'hover:bg-ink-800/30'}`}
                    >
                      <td className="px-3 py-2.5">
                        <span
                          className={`display tnum text-[18px] font-bold ${
                            leader.rank <= 3 ? MEDALS[leader.rank - 1] : 'text-mist-500'
                          }`}
                        >
                          {leader.rank}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={leader.username} hue={leader.avatarHue} size={28} />
                          <span className="text-[13px] font-semibold text-mist-100">{leader.username}</span>
                          {isMe ? (
                            <span className="rounded bg-gold-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-gold-400 uppercase">
                              you
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <BeanIcon className="h-3 w-3" />
                          <span className="tnum text-[13px] font-bold text-gold-400">{beans(leader.balance)}</span>
                        </span>
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-[12px] text-mist-300">{leader.bets}</td>
                      <td className="tnum px-3 py-2.5 text-right text-[12px] text-up-400">{leader.wins}</td>
                      <td className="tnum px-3 py-2.5 text-right text-[12px] text-mist-300">{strike}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="text-[11px] text-mist-500">
        Balances include every bonus, drop, stake and payout recorded in the ledger — the ranking is a direct read of
        the entries table, not a separate scoreboard that could fall out of sync.
      </p>
    </div>
  );
}
