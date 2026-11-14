import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, X } from 'lucide-react';
import { Client, CompanySettings, Invoice, Job } from '../types/erp';
import { formatMoney } from '../utils/vat';

interface ClientsViewProps {
  settings: CompanySettings;
  clients: Client[];
  jobs: Job[];
  invoices: Invoice[];
  onCreateClient: (
    input: Omit<Client, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<string | undefined>;
  onUpdateClient: (
    clientId: string,
    input: Partial<Omit<Client, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  settings,
  clients,
  jobs,
  invoices,
  onCreateClient,
  onUpdateClient,
}) => {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxPin, setTaxPin] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setCompanyName('');
    setContactName('');
    setEmail('');
    setPhone('');
    setTaxPin('');
    setAddress('');
    setPaymentTermsDays('30');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditing(client);
    setCompanyName(client.companyName);
    setContactName(client.contactName);
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setTaxPin(client.taxPin || '');
    setAddress(client.address || '');
    setPaymentTermsDays(String(client.paymentTermsDays ?? 30));
    setNotes(client.notes || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        taxPin: taxPin.trim(),
        address: address.trim(),
        paymentTermsDays: Number(paymentTermsDays) || 30,
        notes: notes.trim(),
      };
      if (editing) {
        await onUpdateClient(editing.id, payload);
      } else {
        await onCreateClient(payload);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        (c.taxPin || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client name, contact, or ZIMRA BP #..."
            className="pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Client</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No clients registered yet. Add your first corporate or retail customer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">Company &amp; Contact</th>
                  <th className="py-2.5 px-4">Phone / Email</th>
                  <th className="py-2.5 px-4">ZIMRA BP / Tax #</th>
                  <th className="py-2.5 px-4 text-right">Terms</th>
                  <th className="py-2.5 px-4 text-right">Jobs</th>
                  <th className="py-2.5 px-4 text-right">Total Billed</th>
                  <th className="py-2.5 px-4 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((client) => {
                  const clientJobs = jobs.filter((j) => j.clientId === client.id);
                  const totalBilled = invoices
                    .filter((i) => i.clientId === client.id && i.status !== 'Void')
                    .reduce((acc, i) => acc + (i.grossAmount || 0), 0);
                  return (
                    <tr key={client.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{client.companyName}</div>
                        <div className="text-xs text-slate-500">{client.contactName}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div>{client.phone || '—'}</div>
                        <div className="text-slate-400">{client.email || '—'}</div>
                      </td>
                      <td className="py-3 px-4 font-mono-nums text-xs text-slate-700">
                        {client.taxPin || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-600">
                        Net {client.paymentTermsDays}d
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-800">
                        {clientJobs.length}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900">
                        {formatMoney(totalBilled, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(client)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
                          aria-label={`Edit ${client.companyName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                {editing ? 'Update Client' : 'Register New Client'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Company / Client Name
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Primary Contact Person
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Client ZIMRA BP / Tax #
                  </label>
                  <input
                    type="text"
                    value={taxPin}
                    onChange={(e) => setTaxPin(e.target.value)}
                    placeholder="e.g. BP 0200881920"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Terms (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Billing / Delivery Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Account Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  {saving ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
