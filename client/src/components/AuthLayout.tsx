import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BeanIcon, Icon, LiveDot, Wordmark } from './ui';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <div className="border-b border-gold-500/20 bg-gold-500/[0.07]">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-1.5 sm:px-4">
          <Icon name="info" className="h-3.5 w-3.5 shrink-0 text-gold-500" />
          <p className="truncate text-[11px] text-gold-300/90">
            <span className="font-semibold">Coursework simulation.</span> Gold Beans are play money — no real
            wagering, no payments, no cash-out.
          </p>
        </div>
      </div>

      <header className="border-b border-ink-700 bg-ink-950/85">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-3 py-3 sm:px-4">
          <Link to="/">
            <Wordmark />
          </Link>
          <Link to="/" className="btn btn-quiet text-[12px]">
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            Back to the board
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-3 py-10">
        <div className="w-full max-w-[420px] animate-rise">
          <div className="mb-5 text-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/10">
              <BeanIcon className="h-6 w-6" />
            </span>
            <h1 className="display mt-3 text-[30px] leading-none font-bold tracking-wide uppercase">{title}</h1>
            <p className="mt-2 text-[12px] leading-relaxed text-mist-400">{subtitle}</p>
          </div>

          <div className="panel p-5">{children}</div>

          {footer ? <div className="mt-4 text-center text-[12px] text-mist-400">{footer}</div> : null}

          <p className="mt-6 text-center text-[10px] leading-relaxed text-mist-500">
            By creating an account you get 1,000 fictional gold beans. Nothing on this site can be bought, sold or
            withdrawn. <LiveDot label="simulated" className="ml-1 align-middle" />
          </p>
        </div>
      </main>
    </div>
  );
}
