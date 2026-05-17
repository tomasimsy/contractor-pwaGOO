import { LineItem } from "@/types";
import { formatCurrency } from "@/lib/utils/formatting";

interface LineItemsEditorProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}

export default function LineItemsEditor({
  items,
  onChange,
}: LineItemsEditorProps) {
  const addItem = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        category: "Material",
        name: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        taxable: false,
        total: 0,
      },
    ]);
  };

  const updateItem = (
    id: string,
    field: keyof LineItem,
    value: any
  ) => {
    onChange(
      items.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };
        updated.total = updated.quantity * updated.unit_price;

        return updated;
      })
    );
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      onChange(items.filter((i) => i.id !== id));
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs font-semibold text-gray-700">
          Line Items
        </div>

        <button
          onClick={addItem}
          className="text-[11px] px-3 py-1 rounded-full bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98] transition"
        >
          + Add Item
        </button>
      </div>

      {/* ITEMS */}
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-lg border border-gray-100 bg-gray-50 p-3"
          >
            {/* TOP ROW */}
            <div className="flex gap-2 items-center mb-2">
              <input
                type="text"
                placeholder="Item name"
                value={item.name}
                onChange={(e) =>
                  updateItem(item.id, "name", e.target.value)
                }
                className="flex-1 bg-white border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
              />

              <select
                value={item.category}
                onChange={(e) =>
                  updateItem(item.id, "category", e.target.value)
                }
                className="w-24 bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px]"
              >
                <option value="Material">Material</option>
                <option value="Labor">Labor</option>
                <option value="Other">Other</option>
              </select>

              {items.length > 1 && (
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-[11px] text-red-500 hover:text-red-600 px-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* DESCRIPTION */}
            <textarea
              placeholder="Description (optional)"
              value={item.description}
              onChange={(e) =>
                updateItem(item.id, "description", e.target.value)
              }
              className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] mb-2 resize-none"
              rows={1}
            />

            {/* BOTTOM ROW */}
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) =>
                  updateItem(item.id, "quantity", Number(e.target.value))
                }
                className="w-16 bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px]"
              />

              <input
                type="number"
                placeholder="Price"
                value={item.unit_price}
                onChange={(e) =>
                  updateItem(
                    item.id,
                    "unit_price",
                    Number(e.target.value)
                  )
                }
                className="w-24 bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px]"
              />

              <div className="flex-1 text-right text-[11px] font-semibold text-gray-800">
                {formatCurrency(item.quantity * item.unit_price)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}