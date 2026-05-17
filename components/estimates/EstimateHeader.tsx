interface EstimateHeaderProps {
  business: {
    name: string;
  };
  client: {
    name: string;
    address?: string | null;
  };
  estimate: {
    id: string;
    created_at: string;
  };
}

export default function EstimateHeader({ business, client, estimate }: EstimateHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold">{business.name}</h1>

      <div className="mt-2">
        <p className="font-semibold">{client.name}</p>
        {client.address && <p className="text-sm text-gray-600">{client.address}</p>}
      </div>

      <div className="mt-4 flex justify-between">
        <div>
          <p className="text-gray-500 text-sm">Estimate #</p>
          <p className="font-semibold">{estimate.id.slice(0, 8)}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-sm">Date</p>
          <p className="font-semibold">{new Date(estimate.created_at).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}