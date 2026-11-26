import { toast } from 'sonner';

export async function copyText(value: string, successMessage: string, failureMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error(failureMessage);
  }
}
