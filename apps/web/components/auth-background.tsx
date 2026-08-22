import { cn } from '../lib/utils';

export function AuthBackground({ children, contentClassName }: { children: React.ReactNode; contentClassName?: string }) {
  return (
    <main className="auth-background relative isolate min-h-dvh overflow-x-hidden text-white">
      <div className={cn('relative z-10 flex min-h-dvh items-center justify-center p-5', contentClassName)}>
        {children}
      </div>
    </main>
  );
}
