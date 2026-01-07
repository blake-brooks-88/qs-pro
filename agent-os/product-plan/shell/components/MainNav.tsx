import { cn } from '@/lib/utils';

interface MainNavProps {
  items: Array<{ label: string; href: string; isActive?: boolean }>;
  onNavigate?: (href: string) => void;
  className?: string;
}

export function MainNav({ items, onNavigate, className }: MainNavProps) {
  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {items.map((item) => (
        <button
          key={item.href}
          onClick={() => onNavigate?.(item.href)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            item.isActive 
              ? "bg-primary text-primary-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
