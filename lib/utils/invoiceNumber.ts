// Simple counter that resets each time server restarts
let counter = 0;

export const generateInvoiceNumber = () => {
  const year = new Date().getFullYear();
  counter++;
  const padded = counter.toString().padStart(4, '0');
  return `OSR${year}${padded}`;
};