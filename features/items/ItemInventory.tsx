import React, { useEffect, useState } from 'react';
import { borrowService, BorrowableItem } from '../../lib/borrowService';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';

const ItemInventory: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<BorrowableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    item_description: '',
    item_category: 'Tablet',
  });

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    if (!user?.office_id) return;
    setLoading(true);
    const allItems = await borrowService.getAllItems(user.office_id);
    setItems(allItems);
    setLoading(false);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.office_id) {
      toast.error('User office not found');
      return;
    }

    if (!formData.item_code || !formData.item_name) {
      toast.error('Item code and name are required');
      return;
    }

    const newItem = await borrowService.createItem(
      user.office_id,
      formData.item_code,
      formData.item_name,
      formData.item_description,
      formData.item_category
    );

    if (newItem) {
      toast.success('Item added successfully');
      setItems([...items, newItem]);
      setFormData({
        item_code: '',
        item_name: '',
        item_description: '',
        item_category: 'Tablet',
      });
      setShowForm(false);
    } else {
      toast.error('Failed to add item');
    }
  };

  const handleMarkDamaged = async (itemId: number) => {
    const updated = await borrowService.markItemDamaged(itemId);
    if (updated) {
      toast.success('Item marked as damaged');
      setItems(items.map((i) => (i.item_id === itemId ? updated : i)));
    }
  };

  const handleArchive = async (itemId: number) => {
    const updated = await borrowService.archiveItem(itemId);
    if (updated) {
      toast.success('Item archived');
      setItems(items.map((i) => (i.item_id === itemId ? updated : i)));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'bg-green-50 border-green-200 text-green-900';
      case 'Damaged':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'Archived':
        return 'bg-slate-50 border-slate-200 text-slate-900';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-900';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Available':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'Damaged':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Package className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* The page title lives on the tab shell; this row carries only the action. */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600">
          Items your office lends out during events. Each needs a QR code matching its item code.
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex shrink-0 items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Add Item Form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Add New Item</h2>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Item Code (QR)*
              </label>
              <input
                type="text"
                placeholder="e.g., TABLET-001"
                value={formData.item_code}
                onChange={(e) =>
                  setFormData({ ...formData, item_code: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Unique identifier used in QR code
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Item Name*
              </label>
              <input
                type="text"
                placeholder="e.g., Tablet A"
                value={formData.item_name}
                onChange={(e) =>
                  setFormData({ ...formData, item_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description
              </label>
              <input
                type="text"
                placeholder="e.g., iPad Pro 11-inch, Silver (SN: 123456)"
                value={formData.item_description}
                onChange={(e) =>
                  setFormData({ ...formData, item_description: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Category
              </label>
              <select
                value={formData.item_category}
                onChange={(e) =>
                  setFormData({ ...formData, item_category: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Tablet">Tablet</option>
                <option value="Laptop">Laptop</option>
                <option value="Equipment">Equipment</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Add Item
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 px-4 bg-slate-100 text-slate-900 font-medium rounded-lg hover:bg-slate-200 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="text-slate-600">Loading items...</div>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No items yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Add items to get started with borrowing
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.item_id}
              className={`bg-white rounded-lg border ${getStatusColor(item.status)} p-4`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(item.status)}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {item.item_name}
                    </h3>
                    <p className="text-xs font-mono text-slate-600 mt-1">
                      {item.item_code}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-200 text-slate-700 rounded whitespace-nowrap ml-2">
                  {item.status}
                </span>
              </div>

              {item.item_description && (
                <p className="text-sm text-slate-600 mb-3">{item.item_description}</p>
              )}

              {item.item_category && (
                <p className="text-xs text-slate-500 mb-3">
                  Category: {item.item_category}
                </p>
              )}

              {item.status === 'Available' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMarkDamaged(item.item_id)}
                    className="flex-1 text-xs py-2 px-3 bg-red-50 text-red-700 hover:bg-red-100 rounded transition font-medium"
                  >
                    Mark Damaged
                  </button>
                  <button
                    onClick={() => handleArchive(item.item_id)}
                    className="flex-1 text-xs py-2 px-3 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition font-medium"
                  >
                    Archive
                  </button>
                </div>
              )}

              {item.status === 'Damaged' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleArchive(item.item_id)}
                    className="flex-1 text-xs py-2 px-3 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition font-medium"
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ItemInventory;
