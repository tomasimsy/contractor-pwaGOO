export const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

export const formatDate = (date: string | null): string => {
  if (!date) return "Not set";
  return new Date(date).toLocaleDateString();
};

export const formatShortDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};