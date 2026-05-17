export function EstimateSignatures({ signatures }) {
  return (
    <div className="mt-10">
      <p className="text-xs text-gray-500 mb-2">
        By signing, the customer agrees to the terms.
      </p>

      {signatures.map(sig => (
        <img
          key={sig.id}
          src={sig.url}
          className="w-full h-24 object-contain mb-3"
        />
      ))}
    </div>
  );
}
