import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 border-0 font-[inherit]',
  {
    variants: {
      variant: {
        default:     'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800',
        secondary:   'bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700 active:bg-gray-600',
        destructive: 'bg-red-950 text-red-400 border border-red-900 hover:bg-red-900',
        success:     'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
        ghost:       'bg-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800',
        outline:     'border border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800',
        link:        'bg-transparent text-indigo-400 underline-offset-4 hover:underline p-0',
      },
      size: {
        default: 'px-4 py-2.5',
        sm:      'px-3 py-1.5 text-xs',
        lg:      'px-6 py-3 text-base',
        icon:    'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'default',
    },
  }
);

function Button({ className, variant, size, ...props }) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
