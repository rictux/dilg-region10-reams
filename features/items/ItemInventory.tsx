import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';
import {
  borrowService,
  BorrowableItem,
  ActiveLoan,
  ItemBorrowHistory,
  formatBorrowDuration,
} from '../../lib/borrowService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import {
  Plus,
  AlertCircle,
  CheckCircle,
  Package,
  Pencil,
  Download,
  Search,
  Loader2,
  Archive,
  RotateCcw,
  X,
  UserCheck,
  History,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * What the card shows. 'Borrowed' is not a stored status — it is derived from an
 * open borrowed_items row and takes precedence over 'Available', because an item
 * someone is holding is not available to lend.
 */
type DisplayState = 'Available' | 'Borrowed' | 'Damaged' | 'Archived';
type StatusFilter = 'all' | DisplayState;

const CATEGORIES = ['Tablet', 'Laptop', 'Equipment', 'Other'];

/**
 * Width in pixels the QR is rasterised to on download, whatever size it is drawn
 * at on screen. Keeps a printed label crisp when its preview is small.
 */
const LABEL_EXPORT_PX = 540;

const STATE_CHIP: Record<DisplayState, string> = {
  Available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Borrowed: 'bg-amber-50 text-amber-700 border-amber-200',
  Damaged: 'bg-red-50 text-red-700 border-red-200',
  Archived: 'bg-slate-100 text-slate-600 border-slate-200',
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

  /** The item whose borrow/return trail is open, from clicking its card. */
  const [historyItem, setHistoryItem] = useState<BorrowableItem | null>(null);

  /** item_id → the open loan holding it. Absent means the item is on hand. */
  const [loansByItem, setLoansByItem] = useState<Map<number, ActiveLoan>>(new Map());

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
      const all = await borrowService.getAllItems(user.office_id);
      setItems(all);

      // Loan state is derived, so it is re-read every time the list is, rather
      // than cached anywhere it could go stale against borrowed_items.
      const loans = await borrowService.getActiveLoansForItems(all.map((i) => i.item_id));
      setLoansByItem(new Map(loans.map((l) => [l.item_id, l])));
    } catch (err) {
      console.error('Failed to load items:', err);
      toast.error('Could not load items.');
    } finally {
      setLoading(false);
    }
  };

  const displayState = (item: BorrowableItem): DisplayState => {
    if (item.status === 'Available' && loansByItem.has(item.item_id)) return 'Borrowed';
    return item.status;
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

    const name = form.item_name.trim();
    if (!name) {
      toast.error('Item name is required.');
      return;
    }

    setSaving(true);
    try {
      if (formTarget === 'new') {
        // No code passed — the database generates it from the category.
        const created = await borrowService.createItem(
          user.office_id,
          name,
          form.item_description,
          form.item_category
        );
        setItems((prev) => [...prev, created]);
        toast.success(`${created.item_name} added as ${created.item_code}.`);
        // Straight to the label — a new item is not usable until it carries one.
        setQrItem(created);
      } else if (formTarget) {
        // item_code is omitted: it is printed on a label already stuck to the
        // item, so it is not the app's to rewrite.
        const updated = await borrowService.updateItem(formTarget.item_id, user.office_id, {
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
        toast.error('That item code is already in use. Try again.');
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
      .filter((i) => statusFilter === 'all' || displayState(i) === statusFilter)
      .filter(
        (i) =>
          !term ||
          i.item_name.toLowerCase().includes(term) ||
          i.item_code.toLowerCase().includes(term) ||
          (i.item_description || '').toLowerCase().includes(term) ||
          (loansByItem.get(i.item_id)?.participant_name || '').toLowerCase().includes(term)
      )
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [items, searchTerm, statusFilter, loansByItem]);

  const counts = useMemo(() => {
    const tally = { all: items.length, Available: 0, Borrowed: 0, Damaged: 0, Archived: 0 };
    items.forEach((i) => {
      tally[displayState(i)] += 1;
    });
    return tally;
  }, [items, loansByItem]);

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
          {(['all', 'Available', 'Borrowed', 'Damaged', 'Archived'] as StatusFilter[]).map((status) => (
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
          {visibleItems.map((item) => {
            const state = displayState(item);
            const loan = loansByItem.get(item.item_id);
            return (
            <div
              key={item.item_id}
              role="button"
              tabIndex={0}
              onClick={() => setHistoryItem(item)}
              onKeyDown={(e) => {
                // Only the card's own key presses open the history — the nested
                // buttons handle Enter/Space themselves and their events bubble.
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setHistoryItem(item);
                }
              }}
              aria-label={`View borrow history for ${item.item_name}`}
              className="flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="flex items-start gap-3">
                {/* The thumbnail is the way into the label from the grid. Every
                    control on the card stops propagation, or it would also
                    trigger the card's own history click. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setQrItem(item);
                  }}
                  title="View QR label"
                  className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 transition-colors hover:border-indigo-400"
                >
                  <ItemQrCode value={item.item_code} size={56} />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-slate-900">{item.item_name}</h3>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATE_CHIP[state]}`}
                    >
                      {state}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{item.item_code}</p>
                  {item.item_category && (
                    <p className="mt-1 text-xs text-slate-400">{item.item_category}</p>
                  )}
                </div>
              </div>

              {/* Absorbs the height difference between cards — a card with a
                  loan panel is taller, and without this the action rows sit at
                  different heights across the row. */}
              <div className="flex-1">
                {item.item_description && (
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">{item.item_description}</p>
                )}

                {loan && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-amber-900">
                        {loan.participant_name}
                      </p>
                      <p className="text-xs text-amber-700">
                        since {format(new Date(loan.borrowed_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(item);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                {item.status === 'Available' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      changeStatus(item, 'Damaged');
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    Damaged
                  </button>
                )}
                {item.status !== 'Available' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      changeStatus(item, 'Available');
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                )}
                {item.status !== 'Archived' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      changeStatus(item, 'Archived');
                    }}
                    disabled={Boolean(loan)}
                    title={loan ? 'Cannot archive an item that is out on loan' : undefined}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-100"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                )}
              </div>
            </div>
            );
          })}
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

      {historyItem && (
        <ItemHistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </div>
  );
};

// ─── Borrow / return history ────────────────────────────────────────────────

/**
 * Where this one item has been: every loan against it, newest first, across all
 * events. Loaded on open rather than with the grid — most cards are never
 * opened, and the trail is only meaningful once you are looking at one item.
 */
const ItemHistoryModal: React.FC<{ item: BorrowableItem; onClose: () => void }> = ({
  item,
  onClose,
}) => {
  const [records, setRecords] = useState<ItemBorrowHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const rows = await borrowService.getItemBorrowHistory(item.item_id);
        if (!cancelled) setRecords(rows);
      } catch (err) {
        console.error('Failed to load item history:', err);
        if (!cancelled) {
          setRecords([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [item.item_id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const openLoans = records.filter((r) => r.status === 'Unreturned').length;
  const totalMinutes = records.reduce((sum, r) => sum + r.duration_minutes, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Borrow history for ${item.item_name}`}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[92rem] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <History className="h-4 w-4 shrink-0 text-indigo-600" />
              <span className="truncate">{item.item_name}</span>
            </h2>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{item.item_code}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Label beside the trail, not behind another click: whoever is auditing
            an item's movements is also the person most likely to need its tag
            reprinted. Stacks above the history until there is room for a column. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside className="shrink-0 border-b border-slate-100 bg-slate-50/60 p-4 lg:w-48 lg:border-b-0 lg:border-r">
            <ItemLabel item={item} size={130} compact />
            <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
              Print and attach to the item.
            </p>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col">
            {!loading && !failed && records.length > 0 && (
              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                <div className="px-5 py-3">
                  <p className="text-[11px] font-medium uppercase text-slate-500">No. of Records</p>
                  <p className="mt-0.5 text-xl font-bold text-slate-900">{records.length}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Out Now</p>
                  <p
                    className={`mt-0.5 text-xl font-bold ${
                      openLoans > 0 ? 'text-amber-600' : 'text-slate-900'
                    }`}
                  >
                    {openLoans}
                  </p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-[11px] font-medium uppercase text-slate-500">Total Time Out</p>
                  <p className="mt-0.5 text-xl font-bold text-slate-900">
                    {formatBorrowDuration(totalMinutes)}
                  </p>
                </div>
              </div>
            )}

            {/* On a narrow screen the whole body scrolls as one; from lg the history
                gets its own scroller so the label column stays put. */}
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading history...
                </div>
              ) : failed ? (
                <div className="px-5 py-12 text-center">
                  <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-200" />
                  <p className="font-medium text-slate-600">Could not load history</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Check your connection and open the card again.
                  </p>
                </div>
              ) : records.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Package className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                  <p className="font-medium text-slate-600">Never borrowed</p>
                  <p className="mt-1 text-sm text-slate-500">
                    This item has no borrow or return records yet.
                  </p>
                </div>
              ) : (
                <table className="w-full table-auto">
                  {/* Auto layout with the slack given to the two columns that
                      hold free text: the event name takes what is left over, the
                      borrower gets a quarter, and the rest are w-px + nowrap,
                      which auto layout resolves as "no wider than the content". */}
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="w-1/4 px-5 py-2.5 text-left text-xs font-semibold text-slate-700">
                        Borrower
                      </th>
                      <th className="w-1/2 px-3 py-2.5 text-left text-xs font-semibold text-slate-700">
                        Event
                      </th>
                      <th className="w-px whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-slate-700">
                        Borrowed
                      </th>
                      <th className="w-px whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-slate-700">
                        Returned
                      </th>
                      <th className="w-px whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-slate-700">
                        Held
                      </th>
                      <th className="w-px whitespace-nowrap px-5 py-2.5 text-center text-xs font-semibold text-slate-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((record) => (
                      <tr key={record.borrow_id} className="transition hover:bg-slate-50">
                        <td className="px-5 py-3 text-sm font-medium text-slate-900">
                          {record.participant_name}
                        </td>
                        {/* max-w-0 lets the column keep the width its header
                            asked for: without it auto layout would grow the
                            table to fit the longest name rather than clip it. */}
                        <td className="max-w-0 px-3 py-3 text-sm text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="min-w-0 truncate" title={record.event_name}>
                              {record.event_name}
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
                          {format(new Date(record.borrowed_at), 'MMM d, yyyy h:mm a')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
                          {record.returned_at
                            ? format(new Date(record.returned_at), 'MMM d, yyyy h:mm a')
                            : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
                          {formatBorrowDuration(record.duration_minutes)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-center">
                          {record.status === 'Returned' ? (
                            <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                              <CheckCircle className="h-3 w-3" />
                              Returned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                              <AlertCircle className="h-3 w-3" />
                              Out
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
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
        {mode === 'edit' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Item Code</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
              {form.item_code}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Printed on the item's label, so it is fixed once assigned.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Item Name *</label>
          <input
            type="text"
            autoFocus
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
 * The printable label and its download control, shared by the label modal and
 * the history modal. Everything inside `labelRef` is what gets rasterised, so it
 * carries the human-readable name alongside the code — a label whose QR will not
 * scan still has to be identifiable by eye.
 */
const ItemLabel: React.FC<{ item: BorrowableItem; size?: number; compact?: boolean }> = ({
  item,
  size = 180,
  compact = false,
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
        // Export resolution is pinned to the label's print size rather than to
        // however large it happens to be drawn, so a small on-screen preview
        // still downloads a label you can print. 180 @ 3x is the baseline.
        pixelRatio: LABEL_EXPORT_PX / size,
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
    <div className="flex flex-col items-center">
      {/* p-4 is the QR quiet zone, not decoration — scanners need clear
          margin around the symbol, so it stays even without a frame. */}
      <div
        ref={labelRef}
        className={`inline-flex flex-col items-center bg-white ${compact ? 'p-3' : 'p-4'}`}
      >
        <ItemQrCode value={item.item_code} size={size} />
        <p
          className={`text-center leading-tight text-[#111110] ${
            compact ? 'mt-2 text-xs' : 'mt-3 text-sm'
          }`}
          style={{ maxWidth: size }}
        >
          {item.item_name}
        </p>
      </div>

      <button
        onClick={download}
        disabled={downloading}
        className={`flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 ${
          compact ? 'mt-2 px-3 py-1.5 text-xs' : 'mt-4 px-4 py-2.5'
        }`}
      >
        {downloading ? (
          <Loader2 className={compact ? 'h-3.5 w-3.5 animate-spin' : 'h-4 w-4 animate-spin'} />
        ) : (
          <Download className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        )}
        {downloading ? 'Preparing...' : 'Download PNG'}
      </button>
    </div>
  );
};

const QrLabelModal: React.FC<{ item: BorrowableItem; onClose: () => void }> = ({
  item,
  onClose,
}) => (
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
        <ItemLabel item={item} size={180} />
        <p className="mt-3 text-center text-xs text-slate-500">Print and attach to the item.</p>
      </div>
    </div>
  </div>
);

export default ItemInventory;
