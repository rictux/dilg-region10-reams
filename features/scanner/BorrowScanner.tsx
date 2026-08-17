import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { borrowService, ActiveBorrow } from '../../lib/borrowService';
import { useAuth } from '../../contexts/AuthContext';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Camera,
  Plus,
  Settings,
  Tabs,
} from 'lucide-react';
import { toast } from 'sonner';
import { Participant, BorrowableItem } from '../../types/database';
import { format } from 'date-fns';

type BorrowScanMode = 'idle' | 'waiting_participant' | 'waiting_item' | 'confirming';
type BorrowAction = 'borrow' | 'return';

interface BorrowScanState {
  mode: BorrowScanMode;
  action: BorrowAction;
  selectedParticipant?: {
    participant_id: number;
    full_name: string;
    position: string;
    activeBorrows: ActiveBorrow[];
  };
  selectedItem?: {
    item_id: number;
    item_name: string;
    item_code: string;
  };
}

interface RecentScan {
  id: string;
  name: string;
  type: 'borrow' | 'return';
  item: string;
  status: 'success' | 'error';
  timestamp: Date;
  message: string;
}

const BorrowScanner: React.FC<{ eventId: number }> = ({ eventId }) => {
  const { user } = useAuth();
  const qrRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [scanState, setScanState] = useState<BorrowScanState>({
    mode: 'idle',
    action: 'borrow',
  });

  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [isScannerRunning, setIsScannerRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ==================== Scanner Lifecycle ====================

  useEffect(() => {
    if (!qrRef.current) return;

    const initScanner = async () => {
      try {
        scannerRef.current = new Html5Qrcode('borrow-scanner', {
          formFactor: 'portrait',
          disableFlip: false,
        });

        const formats = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
        ];

        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250, formats },
          onScanSuccess,
          undefined
        );

        setIsScannerRunning(true);
      } catch (err) {
        console.error('Failed to start scanner:', err);
        toast.error('Failed to start camera');
      }
    };

    initScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
        setIsScannerRunning(false);
      }
    };
  }, []);

  // ==================== Scan Handlers ====================

  const onScanSuccess = useCallback(
    async (decodedText: string) => {
      const trimmed = decodedText.trim();

      if (scanState.mode === 'waiting_participant') {
        await handleParticipantScan(trimmed);
      } else if (scanState.mode === 'waiting_item') {
        await handleItemScan(trimmed);
      }
    },
    [scanState.mode, scanState.action]
  );

  const handleParticipantScan = async (participantCode: string) => {
    try {
      // Lookup participant
      const { data: participant, error } = await supabase
        .from('participants')
        .select('*')
        .eq('participant_code', participantCode)
        .single();

      if (error || !participant) {
        toast.error('Participant not found');
        return;
      }

      // Get active borrows if returning
      let activeBorrows: ActiveBorrow[] = [];
      if (scanState.action === 'return') {
        activeBorrows = await borrowService.getActiveBorrows(
          participant.participant_id,
          eventId
        );

        if (activeBorrows.length === 0) {
          toast.warning('No borrowed items to return');
          return;
        }
      }

      setScanState((prev) => ({
        ...prev,
        mode: 'waiting_item',
        selectedParticipant: {
          participant_id: participant.participant_id,
          full_name: participant.full_name,
          position: participant.position || 'N/A',
          activeBorrows,
        },
      }));

      toast.success(
        `${scanState.action === 'borrow' ? 'Scan item to borrow' : 'Scan item to return'}`
      );
    } catch (err) {
      console.error('Error scanning participant:', err);
      toast.error('Error processing scan');
    }
  };

  const handleItemScan = async (itemCode: string) => {
    if (!scanState.selectedParticipant || !user?.office_id) return;

    try {
      // Lookup item (filtered by office)
      const item = await borrowService.getItemByCode(itemCode, user.office_id);

      if (!item) {
        toast.error('Item not found in your office inventory');
        return;
      }

      setScanState((prev) => ({
        ...prev,
        mode: 'confirming',
        selectedItem: {
          item_id: item.item_id,
          item_name: item.item_name,
          item_code: item.item_code,
        },
      }));
    } catch (err) {
      console.error('Error scanning item:', err);
      toast.error('Error processing scan');
    }
  };

  // ==================== Action Handlers ====================

  const handleBorrow = async () => {
    if (!scanState.selectedParticipant || !scanState.selectedItem) return;

    try {
      const result = await borrowService.borrowItem(
        eventId,
        scanState.selectedParticipant.participant_id,
        scanState.selectedItem.item_id,
        'scanner-app'
      );

      if (result) {
        addRecentScan({
          id: `borrow-${result.borrow_id}`,
          name: scanState.selectedParticipant.full_name,
          type: 'borrow',
          item: scanState.selectedItem.item_name,
          status: 'success',
          message: `Borrowed to ${scanState.selectedParticipant.full_name}`,
        });

        toast.success('Item borrowed successfully');
        resetScanner();
      }
    } catch (err) {
      console.error('Error borrowing item:', err);
      toast.error('Failed to borrow item');
    }
  };

  const handleReturn = async () => {
    if (!scanState.selectedParticipant || !scanState.selectedItem) return;

    try {
      // Find the active borrow record
      const activeBorrows = await borrowService.getActiveBorrows(
        scanState.selectedParticipant.participant_id,
        eventId
      );

      const borrow = activeBorrows.find((b) => b.item_id === scanState.selectedItem!.item_id);

      if (!borrow) {
        toast.error('No active borrow found for this item');
        return;
      }

      const result = await borrowService.returnItem(
        borrow.borrow_id,
        scanState.selectedParticipant.participant_id,
        'scanner-app'
      );

      if (result) {
        addRecentScan({
          id: `return-${result.borrow_id}`,
          name: scanState.selectedParticipant.full_name,
          type: 'return',
          item: scanState.selectedItem.item_name,
          status: 'success',
          message: `Returned by ${scanState.selectedParticipant.full_name}`,
        });

        toast.success('Item returned successfully');
        resetScanner();
      }
    } catch (err) {
      console.error('Error returning item:', err);
      toast.error('Failed to return item');
    }
  };

  const resetScanner = () => {
    setScanState({
      mode: 'waiting_participant',
      action: scanState.action,
    });
  };

  const addRecentScan = (scan: RecentScan) => {
    setRecentScans((prev) => [scan, ...prev.slice(0, 4)]);
  };

  const toggleAction = (action: BorrowAction) => {
    setScanState({
      mode: 'waiting_participant',
      action,
    });
  };

  // ==================== Render ====================

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">
              {scanState.action === 'borrow' ? 'Borrow Items' : 'Return Items'}
            </h2>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Action Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => toggleAction('borrow')}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition ${
              scanState.action === 'borrow'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Borrow
          </button>
          <button
            onClick={() => toggleAction('return')}
            className={`flex-1 py-2 px-3 rounded-lg font-medium transition ${
              scanState.action === 'return'
                ? 'bg-green-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Return
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Status Indicator */}
        {scanState.mode === 'waiting_participant' && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-sm font-medium text-blue-900">
              Scan participant QR code
            </p>
          </div>
        )}

        {scanState.mode === 'waiting_item' && scanState.selectedParticipant && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-900 mb-2">
              Participant Selected:
            </p>
            <div className="text-lg font-semibold text-amber-950">
              {scanState.selectedParticipant.full_name}
            </div>
            <div className="text-sm text-amber-800">
              {scanState.selectedParticipant.position}
            </div>

            {scanState.action === 'return' &&
              scanState.selectedParticipant.activeBorrows.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="font-medium mb-2">Active Borrows:</p>
                  <ul className="space-y-1">
                    {scanState.selectedParticipant.activeBorrows.map((b) => (
                      <li key={b.borrow_id} className="text-xs text-amber-800">
                        • {b.item_name} ({format(new Date(b.borrowed_at), 'HH:mm')})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <p className="text-xs font-medium text-amber-900 mt-3">
              Now scan item QR code
            </p>
          </div>
        )}

        {/* Scanner */}
        <div
          id="borrow-scanner"
          ref={qrRef}
          className="w-full aspect-square rounded-lg overflow-hidden bg-black mb-4"
        />

        {scanState.mode === 'confirming' &&
          scanState.selectedParticipant &&
          scanState.selectedItem && (
            <ConfirmationModal
              action={scanState.action}
              participant={scanState.selectedParticipant}
              item={scanState.selectedItem}
              onConfirm={
                scanState.action === 'borrow' ? handleBorrow : handleReturn
              }
              onCancel={resetScanner}
            />
          )}
      </div>

      {/* Recent Scans */}
      {recentScans.length > 0 && (
        <div className="border-t border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent</h3>
          <div className="space-y-2">
            {recentScans.map((scan) => (
              <div
                key={scan.id}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  scan.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                {scan.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {scan.name}
                  </p>
                  <p className="text-xs text-slate-600">
                    {scan.type === 'borrow' ? '→' : '←'} {scan.item}
                  </p>
                  <p className="text-xs text-slate-500">
                    {format(scan.timestamp, 'HH:mm:ss')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== Confirmation Modal ====================

interface ConfirmationModalProps {
  action: 'borrow' | 'return';
  participant: {
    participant_id: number;
    full_name: string;
    position: string;
  };
  item: {
    item_id: number;
    item_name: string;
    item_code: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  action,
  participant,
  item,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
        <div
          className={`p-4 border-b ${
            action === 'borrow' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'
          }`}
        >
          <h3 className="text-lg font-semibold text-slate-900">
            {action === 'borrow' ? 'Borrow Item' : 'Return Item'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase mb-1">
              Participant
            </p>
            <p className="text-base font-semibold text-slate-900">
              {participant.full_name}
            </p>
            <p className="text-sm text-slate-600">{participant.position}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 uppercase mb-1">
              Item
            </p>
            <p className="text-base font-semibold text-slate-900">{item.item_name}</p>
            <p className="text-xs text-slate-500 font-mono">{item.item_code}</p>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-sm text-slate-700">
              {action === 'borrow'
                ? `${participant.full_name} is borrowing ${item.item_name}`
                : `${participant.full_name} is returning ${item.item_name}`}
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-slate-200">
          <button
            onClick={onCancel}
            className="flex-1 py-2 px-4 bg-slate-100 text-slate-900 font-medium rounded-lg hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 px-4 text-white font-medium rounded-lg transition ${
              action === 'borrow'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {action === 'borrow' ? 'Confirm Borrow' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BorrowScanner;
