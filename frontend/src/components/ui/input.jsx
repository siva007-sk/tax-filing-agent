import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Input = forwardRef(function Input({ className, type, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-gray-100 text-sm outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]',
        className
      )}
      {...props}
    />
  );
});

export { Input };
