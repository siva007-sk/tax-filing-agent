import { cn } from '@/lib/utils';

function Progress({ className, value = 0, indicatorClassName, ...props }) {
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn('w-full h-2 bg-gray-800 rounded-full overflow-hidden', className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn('h-full rounded-full transition-all duration-700', indicatorClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
      />
    </div>
  );
}

export { Progress };
