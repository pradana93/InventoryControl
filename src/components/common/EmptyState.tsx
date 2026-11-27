import { PackageSearch, Inbox, InboxIcon, SearchX } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ElementType;
}

export function EmptyState({ title, description, icon: Icon = PackageSearch }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-border rounded-xl bg-card/50">
      <div className="p-4 bg-muted rounded-full mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
    </div>
  );
}
