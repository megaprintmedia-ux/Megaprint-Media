import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface StatusTextProps {
  status: string;
}

export const StatusText: React.FC<StatusTextProps> = ({ status }) => {
  const normalized = status.toLowerCase();

  if (
    normalized === 'paid' ||
    normalized === 'completed' ||
    normalized === 'approved' ||
    normalized === 'active' ||
    normalized === 'delivered' ||
    normalized === 'in stock' ||
    normalized === 'accepted' ||
    normalized === 'reconciled' ||
    normalized === 'fulfilled'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (
    normalized === 'overdue' ||
    normalized === 'declined' ||
    normalized === 'rejected' ||
    normalized === 'cancelled' ||
    normalized === 'void' ||
    normalized === 'disabled' ||
    normalized === 'revoked' ||
    normalized === 'express' ||
    normalized === 'critical' ||
    normalized === 'out of stock' ||
    normalized === 'disputed' ||
    normalized === 'damaged / rejected'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (
    normalized === 'in production' ||
    normalized === 'quality control' ||
    normalized === 'part paid' ||
    normalized === 'pending' ||
    normalized === 'submitted' ||
    normalized === 'invited' ||
    normalized === 'urgent' ||
    normalized === 'clocked in' ||
    normalized === 'payable' ||
    normalized === 'low stock' ||
    normalized === 'unpaid' ||
    normalized === 'partial / short'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (
    normalized === 'ready for dispatch' ||
    normalized === 'issued' ||
    normalized === 'earned'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
      <span>{status}</span>
    </span>
  );
};
