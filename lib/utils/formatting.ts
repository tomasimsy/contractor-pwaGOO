export const formatCurrency = (amount: number | null | undefined): string => {
  const num = Number(amount || 0);
  return `$${num.toFixed(2)}`;
};

export const formatDate = (date: string | null | undefined): string => {
  if (!date) return "Not set";
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return "Invalid date";
  }
};

export const formatShortDate = (date: string | null | undefined): string => {
  if (!date) return "Not set";
  try {
    return new Date(date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Invalid date";
  }
};