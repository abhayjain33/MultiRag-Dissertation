import { cn } from '@/lib/utils';

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean | undefined; hint?: string | undefined; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { mono?: boolean }
export function Input({ className, mono, ...rest }: InputProps) {
  return <input className={cn('w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 disabled:bg-gray-50', mono && 'font-mono', className)} {...rest} />;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { mono?: boolean }
export function Textarea({ className, mono, ...rest }: TextareaProps) {
  return <textarea className={cn('w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-y', mono && 'font-mono text-xs', className)} {...rest} />;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { options: { value: string; label: string }[] }
export function Select({ options, className, ...rest }: SelectProps) {
  return (
    <select className={cn('w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white', className)} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'ghost' | 'danger' | 'outline'; size?: 'xs' | 'sm' }
const vmap = { primary: 'bg-indigo-600 text-white hover:bg-indigo-700 border-transparent', ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 border-transparent', danger: 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200', outline: 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300' };
const smap = { xs: 'px-2 py-1 text-xs', sm: 'px-3 py-1.5 text-sm' };
export function Button({ variant = 'outline', size = 'sm', className, children, ...rest }: ButtonProps) {
  return <button className={cn('inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-40', vmap[variant], smap[size], className)} {...rest}>{children}</button>;
}

export function SectionCard({ title, subtitle, badge, children }: { title: string; subtitle?: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

export function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={cn('grid gap-4', cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4')}>{children}</div>;
}

export function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
      {children}
      {onRemove && <button onClick={onRemove} className="hover:text-red-500">×</button>}
    </span>
  );
}
