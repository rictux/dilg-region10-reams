import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';
import { borrowService, BorrowableItem } from '../../lib/borrowService';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus,
  AlertCircle,
  CheckCircle,
  Package,
  Pencil,
  QrCode,
  Download,
  Search,
  Loader2,
  Archive,
  RotateCcw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

type StatusFilter = 'all' | BorrowableItem['status'];

const CATEGORIES = ['Tablet', 'Laptop', 'Equipment', 'Other'];

const STATUS_STYLES: Record<BorrowableItem['status'], { chip: string; icon: React.ReactNode }> = {
  Available: {
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircle className="h-4 w-4 text-emerald-600" />,
  },
  Damaged: {
    chip: 'bg-red-50 text-red-700 border-red-200',
    icon: <AlertCircle className="h-4 w-4 text-red-600" />,
  },
  Archived: {
    chip: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: <Archive className="h-4 w-4 text-slate-500" />,
  },
};

interface ItemFormState {
  item_code: string;
  item_name: string;
  item_description: string;
  item_category: string;
  status: BorrowableItem['status'];
}

const emptyForm: ItemFormState = {
  item_code: '',
  item_name: '',
  item_description: '',
  item_category: 'Tablet',
  status: 'Available',
};

/** Postgres uniqueness violation — here, a duplicate item_code within the office. */
const isDuplicateCode = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

/**
 * The same code the event QR uses: level H, black on white, DILG logo centred.
 * Level H recovers 30% of the symbol, which is what lets the logo sit on top of
 * it — so the logo and its white backing are held to roughly a quarter of the
 * width, and both scale with `size` to keep that ratio at any rendering.
 */
const ItemQrCode: React.FC<{ value: string; size: number }> = ({ value, size }) => {
  const logoSize = Math.round(size * 0.24);
  const padding = Math.max(2, Math.round(size * 0.022));

  return (
    <div className="relative inline-block">
      <QRCode value={value} size={size} level="H" fgColor="#000000" bgColor="#FFFFFF" />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{ padding }}
      >
        <img
          src="/assets/dilg_logo.png"
          alt=""
          className="rounded-full object-contain"
          style={{ width: logoSize, height: logoSize }}
        />
      </div>
    </div>
  );
};

const ItemInventory: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<BorrowableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // null = form closed. 'new' = adding. An item = editing that item.
  const [formTarget, setFormTarget] = useState<BorrowableItem | 'new' | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [qrItem, setQrItem] = useState<BorrowableItem | null>(null);

  useEffect(() => {
    loadItems();
  }, [user?.office_id]);

  const loadItems = async () => {
    if (!user?.office_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setItems(await borrowService.getAllItems(user.office_id));
    } catch (err) {
      console.error('Failed to load items:', err);
      toast.error('Could not load items.');
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setForm(emptyForm);
    setFormTarget('new');
  };

  const openEdit = (item: BorrowableItem) => {
    setForm({
      item_code: item.item_code,
      item_name: item.item_name,
      item_description: item.item_description || '',
      item_category: item.item_category || 'Other',
      status: item.status,
    });
    setFormTarget(item);
  };

  const closeForm = () => {
    setFormTarget(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.office_id) {
      toast.error('Your account is not assigned to an office.');
      return;
    }

    const code = form.item_code.trim();
    const name = form.item_name.trim();
    if (!code || !name) {
      toast.error('Item code and name are required.');
      return;
    }

    setSaving(true);
    try {
      if (formTarget === 'new') {
        const created = await borrowService.createItem(
          user.office_id,
          code,
          name,
          form.item_description,
          form.item_category
        );
        setItems((prev) => [...prev, created]);
        toast.success(`${created.item_name} added.`);
        // Straight to the label — a new item is not usable until it carries one.
        setQrItem(created);
      } else if (formTarget) {
        const updated = await borrowService.updateItem(formTarget.item_id, user.office_id, {
          item_code: code,
          item_name: name,
          item_description: form.item_description.trim() || null,
          item_category: form.item_category.trim() || null,
          status: form.status,
        });
        setItems((prev) => prev.map((i) => (i.item_id === updated.item_id ? updated : i)));
        toast.success(`${updated.item_name} updated.`);
      }
      closeForm();
    } catch (err) {
      if (isDuplicateCode(err)) {
        toast.error(`Item code "${code}" is already used in your office.`);
      } else {
        toast.error(formTarget === 'new' ? 'Could not add the item.' : 'Could not save changes.');
      }
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item: BorrowableItem, status: BorrowableItem['status']) => {
    if (!user?.office_id) return;
    try {
      const updated = await borrowService.setItemStatus(item.item_id, user.office_id, status);
      setItems((prev) => prev.map((i) => (i.item_id === updated.item_id ? updated : i)));
      toast.success(`${updated.item_name} marked ${status.toLowerCase()}.`);
    } catch (err) {
      console.error('Failed to change status:', err);
      toast.error('Could not update the item.');
    }
  };

  const visibleItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items
      .filter((i) => statusFilter === 'all' || i.status === statusFilter)
      .filter(
        (i) =>
          !term ||
          i.item_name.toLowerCase().includes(term) ||
          i.item_code.toLowerCase().includes(term) ||
          (i.item_description || '').toLowerCase().includes(term)
      )
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [items, searchTerm, statusFilter]);

  const counts = useMemo(
    () => ({
      all: items.length,
      Available: items.filter((i) => i.status === 'Available').length,
      Damaged: items.filter((i) => i.status === 'Damaged').length,
      Archived: items.filter((i) => i.status === 'Archived').length,
    }),
    [items]
  );

  if (!user?.office_id) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
        <p className="font-medium text-slate-600">No office assigned</p>
        <p className="mt-1 text-sm text-slate-500">
          Items are held per office. Ask an administrator to assign your account to one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, code, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-card py-2 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {(['all', 'Available', 'Damaged', 'Archived'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === status
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-card text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {status === 'all' ? 'All' : status}
              <span className={statusFilter === status ? 'ml-1.5 text-indigo-200' : 'ml-1.5 text-slate-400'}>
                {counts[status === 'all' ? 'all' : status]}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={openAdd}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading items...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="font-medium text-slate-600">No items yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add an item, then print its QR label and attach it.
          </p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="font-medium text-slate-600">No matching items</p>
          <p className="mt-1 text-sm text-slate-500">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <div
              key={item.item_id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                {/* Thumbnail doubles as the "open label" affordance. */}
                <button
                  type="button"
                  onClick={() => setQrItem(item)}
                  title="View QR label"
                  className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 transition-colors hover:border-indigo-400"
                >
                  <ItemQrCode value={item.item_code} size={56} />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-slate-900">{item.item_name}</h3>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[item.status].chip}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{item.item_code}</p>
                  {item.item_category && (
                    <p className="mt-1 text-xs text-slate-400">{item.item_category}</p>
                  )}
                </div>
              </div>

              {item.item_description && (
                <p className="mt-3 line-clamp-2 text-sm text-slate-600">{item.item_description}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => openEdit(item)}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => setQrItem(item)}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  QR Label
                </button>

                {item.status === 'Available' && (
                  <button
                    onClick={() => changeStatus(item, 'Damaged')}
                    className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    Damaged
                  </button>
                )}
                {item.status !== 'Available' && (
                  <button
                    onClick={() => changeStatus(item, 'Available')}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                )}
                {item.status !== 'Archived' && (
                  <button
                    onClick={() => changeStatus(item, 'Archived')}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formTarget && (
        <ItemFormModal
          mode={formTarget === 'new' ? 'add' : 'edit'}
          form={form}
          setForm={setForm}
          saving={saving}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      {qrItem && <QrLabelModal item={qrItem} onClose={() => setQrItem(null)} />}
    </div>
  );
};

// ─── Add / Edit form ────────────────────────────────────────────────────────

interface ItemFormModalProps {
  mode: 'add' | 'edit';
  form: ItemFormState;
  setForm: React.Dispatch<React.SetStateAction<ItemFormState>>;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const ItemFormModal: React.FC<ItemFormModalProps> = ({
  mode,
  form,
  setForm,
  saving,
  onSubmit,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">
          {mode === 'add' ? 'Add Item' : 'Edit Item'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Item Code *</label>
          <input
            type="text"
            autoFocus
            placeholder="e.g. TABLET-001"
            value={form.item_code}
            onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            {mode === 'edit'
              ? 'Changing this invalidates any label already attached to the item.'
              : 'This is the value encoded in the QR code. Must be unique in your office.'}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Item Name *</label>
          <input
            type="text"
            placeholder="e.g. Tablet A"
            value={form.item_name}
            onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            rows={2}
            placeholder="e.g. iPad Pro 11-inch, Silver (SN: 123456)"
            value={form.item_description}
            onChange={(e) => setForm((f) => ({ ...f, item_description: e.target.value }))}
            className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className={mode === 'edit' ? 'grid grid-cols-2 gap-3' : ''}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
            <select
              value={form.item_category}
              onChange={(e) => setForm((f) => ({ ...f, item_category: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {mode === 'edit' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as BorrowableItem['status'] }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Available">Available</option>
                <option value="Damaged">Damaged</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'add' ? 'Add Item' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
);

// ─── QR label ───────────────────────────────────────────────────────────────

/**
 * The printable label. Everything inside `labelRef` is what gets rasterised, so
 * it carries the human-readable name and code alongside the code itself — a
 * label whose QR will not scan still has to be identifiable by eye.
 */
const QrLabelModal: React.FC<{ item: BorrowableItem; onClose: () => void }> = ({
  item,
  onClose,
}) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!labelRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(labelRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        // 3x keeps the modules crisp when the label is printed small.
        pixelRatio: 3,
      });
      const link = document.createElement('a');
      link.download = `${item.item_code.replace(/[^a-zA-Z0-9-_]/g, '_')}-label.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Label downloaded.');
    } catch (err) {
      console.error('Failed to render label:', err);
      toast.error('Could not generate the label image.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">QR Label</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex justify-center">
            <div
              ref={labelRef}
              className="inline-flex flex-col items-center rounded-xl border-4 border-[#111110] bg-white p-4"
            >
              <ItemQrCode value={item.item_code} size={180} />
              <p className="mt-3 max-w-[180px] text-center text-sm font-bold leading-tight text-[#111110]">
                {item.item_name}
              </p>
              <p className="mt-1 font-mono text-xs tracking-wide text-slate-600">{item.item_code}</p>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            Print and attach to the item. The scanner reads the code above.
          </p>

          <button
            onClick={download}
            disabled={downloading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? 'Preparing...' : 'Download PNG'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemInventory;
