import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function formatTime(iso: string): string {
  return format(new Date(iso), 'HH:mm:ss');
}

export function formatDate(iso: string): string {
  return format(new Date(iso), 'dd MMM yyyy HH:mm');
}
