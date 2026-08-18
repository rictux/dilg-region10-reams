import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, History } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Permission } from '../../config/permissions';
import ItemInventory from './ItemInventory';
import BorrowHistory from './BorrowHistory';

type ItemsTab = 'inventory' | 'history';

interface TabDefinition {
  key: ItemsTab;
  label: string;
  icon: React.ElementType;
  /** Mirrors the gate each view carried before they were merged onto one page. */
  permission: Permission;
}

const TABS: TabDefinition[] = [
  { key: 'inventory', label: 'Items',       icon: Package, permission: 'MANAGE_EVENTS' },
  { key: 'history',   label: 'History Log', icon: History, permission: 'VIEW_REPORTS' },
];

/**
 * Inventory and lending history for borrowable items, previously split across
 * Reports and Settings. The active tab lives in the query string so a tab is
 * linkable and survives a reload.
 */
const Items: React.FC = () => {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const visibleTabs = useMemo(
    () => TABS.filter((tab) => hasPermission(tab.permission)),
    [hasPermission]
  );

  const requestedTab = searchParams.get('tab') as ItemsTab | null;
  const activeTab = visibleTabs.some((tab) => tab.key === requestedTab)
    ? (requestedTab as ItemsTab)
    : visibleTabs[0]?.key;

  const selectTab = (tab: ItemsTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  if (visibleTabs.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="font-medium text-slate-600">No access</p>
          <p className="mt-1 text-sm text-slate-500">
            You don't have permission to view items or lending history.
          </p>
        </div>
      </div>
    );
  }

  return (
    // The layout's <main> is overflow-hidden and hands each page a fixed-height
    // box, so a page that runs long has to own its own scrolling or it is simply
    // clipped — which is what happened to the stacked mobile layout here.
    <div className="h-full min-h-0 overflow-y-auto p-6 space-y-6">
      {/* No page heading here — the layout header already names the page.
          A single tab is not a choice, so the strip is hidden when only one
          view is available to this user. */}
      {visibleTabs.length > 1 && (
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex gap-6" aria-label="Items sections">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => selectTab(tab.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {activeTab === 'inventory' && <ItemInventory />}
      {activeTab === 'history' && <BorrowHistory />}
    </div>
  );
};

export default Items;
