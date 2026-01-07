import { UserMenu } from './UserMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Programming } from '@solar-icons/react';

interface HeaderProps {
  user?: { name: string; avatarUrl?: string };
  onLogout?: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 z-20 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shadow-sm">
          <Programming size={20} weight="Bold" className="text-primary-foreground" />
        </div>
        <span className="font-display font-bold text-lg tracking-tight text-foreground">
          Query<span className="text-primary">++</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
