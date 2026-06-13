import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap',
  {
    variants: {
      variant: {
        default:     'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        secondary:   'bg-gray-800 text-gray-400 border-gray-700',
        success:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        warning:     'bg-amber-500/10 text-amber-400 border-amber-500/30',
        destructive: 'bg-red-500/10 text-red-400 border-red-500/30',
        outline:     'bg-transparent text-gray-300 border-gray-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
