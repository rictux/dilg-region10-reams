import React from 'react';
import { Mail, Loader2 } from 'lucide-react';

interface EmailProgressModalProps {
  isOpen: boolean;
  progress: { done: number; total: number } | null;
}

const EmailProgressModal: React.FC<EmailProgressModalProps> = ({ isOpen, progress }) => {
  if (!isOpen || !progress) return null;

  const percentage = Math.round((progress.done / progress.total) * 100);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center gap-4">
          {/* Icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-blue-100 rounded-full animate-pulse" />
            <div className="relative bg-blue-50 rounded-full p-4">
              <Mail size={32} className="text-blue-600" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-lg font-bold text-slate-800 text-center">Sending Certificates</h2>

          {/* Progress bar */}
          <div className="w-full space-y-2">
            <div className="relative h-3 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                {progress.done} of {progress.total}
              </span>
              <span className="text-sm font-medium text-slate-500">{percentage}%</span>
            </div>
          </div>

          {/* Spinning loader */}
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            <span className="text-sm">Processing...</span>
          </div>

          {/* Info text */}
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            Please don't close this window while emails are being sent.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmailProgressModal;
