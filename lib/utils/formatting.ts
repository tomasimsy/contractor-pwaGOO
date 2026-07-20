export const formatCurrency = (amount: number | null | undefined): string => {
  const num = Number(amount || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const formatDate = (date: string | null | undefined): string => {
  if (!date) return "Not set";
  try {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return "Invalid date";
  }
};

export const formatShortDate = (date: string | null | undefined): string => {
  if (!date) return "Not set";
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return "Invalid date";
  }
};

export const formatPercentage = (value: number | null | undefined): string => {
  const num = Number(value || 0);
  return `${num.toFixed(1)}%`;
};