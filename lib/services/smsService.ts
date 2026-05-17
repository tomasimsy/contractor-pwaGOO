// SMS Service - This will open native SMS app on mobile devices
export const sendSMSLink = (phoneNumber: string, documentType: "estimate" | "invoice", documentId: string, documentNumber: string) => {
  // Generate the public link (use your actual domain in production)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const documentUrl = `${baseUrl}/public/${documentType}s/${documentId}`;
  
  // Create the message
  const message = encodeURIComponent(
    `Hello! Please review and sign your ${documentType}: ${documentUrl}\n\n` +
    `${documentType === 'estimate' ? 'Estimate' : 'Invoice'} #${documentNumber}\n` +
    `Total: $${documentType === 'estimate' ? 'VIEW' : 'VIEW'}\n\n` +
    `Please click the link above to view and sign. Thank you!`
  );
  
  // Create SMS URL (works on iOS and Android)
  const smsUrl = `sms:${phoneNumber}?body=${message}`;
  
  // Open native SMS app
  window.location.href = smsUrl;
};

// Alternative: Copy link to clipboard
export const copyLinkToClipboard = (documentType: "estimate" | "invoice", documentId: string, documentNumber: string) => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const documentUrl = `${baseUrl}/public/${documentType}s/${documentId}`;
  
  navigator.clipboard.writeText(documentUrl);
  alert(`Link copied! Send it to your customer via text, email, or any messaging app.\n\n${documentUrl}`);
};