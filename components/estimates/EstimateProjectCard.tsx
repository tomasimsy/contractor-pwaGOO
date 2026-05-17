export function EstimateProjectCard({ project }) {
  const total = project.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  return (
    <div className="border rounded-lg p-4 mb-6 bg-white shadow-sm">
      <h3 className="font-semibold text-lg mb-2">{project.name}</h3>

      {project.description && (
        <p className="text-sm text-gray-600 mb-3">{project.description}</p>
      )}

      {/* Main Image */}
      {project.mainImageUrl && (
        <img src={project.mainImageUrl} className="w-full rounded mb-3" />
      )}

      {/* Gallery */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {project.images.map(img => (
          <img key={img.id} src={img.url} className="rounded" />
        ))}
      </div>

      {/* Line Items */}
      <div className="border-t pt-3">
        {project.lineItems.map(item => (
          <div key={item.id} className="flex justify-between mb-2">
            <span>{item.name}</span>
            <span>${(item.quantity * item.unitPrice).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between font-bold text-lg mt-3">
        <span>Project Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
    </div>
  );
}
