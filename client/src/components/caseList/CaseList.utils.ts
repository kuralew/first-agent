export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

export const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
