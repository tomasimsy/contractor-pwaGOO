export function FloatingActions() {
  return (
    <div className="fixed bottom-6 right-6">
      <div className="bg-black text-white rounded-full p-4 shadow-lg">
        ⋮
      </div>

      <div className="absolute bottom-20 right-0 space-y-3">
        <button className="action-btn">Change Order</button>
        <button className="action-btn">Sign</button>
        <button className="action-btn">Payment</button>
        <button className="action-btn">Edit</button>
        <button className="action-btn">PDF</button>
      </div>
    </div>
  );
}
