 

export default function EstimateHeader({ business, client, estimate }) {
    return (
    <div className="mb-6">
      <h1 className="text-xl font-bold">{business.name}</h1>

      <div className="mt-2">
        <p className="font-semibold">{client.name}</p>
        <p className="text-sm text-gray-600">{client.address}</p>
      </div>

      <div className="mt-4 flex justify-between">
        <div>
          <p className="text-gray-500 text-sm">Estimate #</p>
          <p className="font-semibold">{estimate.id}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-sm">Date</p>
          <p className="font-semibold">{estimate.created_at}</p>
        </div>
      </div>
    </div>
  );
}
