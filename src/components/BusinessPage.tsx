import React, { useState, useMemo, useRef } from 'react';
import {
  Plus,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  Trash2,
  Edit2,
  Download,
  Upload,
  Search,
  Filter,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  FileText
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { BusinessRecord, RecordKind, AppDataSchema } from '../vite-env';
import { formatCurrency, formatDate } from '../utils/formatters';
import { calculateLedgerMetrics, filterRecords, getRevenueExpensesTrend } from '../utils/calculations';
import { exportRecordsToCsv, parseCsvToRecords } from '../utils/csv';

interface BusinessPageProps {
  data: AppDataSchema;
  onUpdateRecords: (records: BusinessRecord[]) => Promise<void>;
}

export const BusinessPage: React.FC<BusinessPageProps> = ({ data, onUpdateRecords }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'revenue' | 'expense' | 'lead'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7d' | '30d' | '90d' | 'this_year'>('all');
  const [sortField, setSortField] = useState<'date' | 'amount' | 'label'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BusinessRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<BusinessRecord | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  // Form State
  const [formDate, setFormDate] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formKind, setFormKind] = useState<RecordKind>('revenue');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const records = data.businessRecords;

  // Categories list
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [records]);

  // Overall metrics
  const ledgerMetrics = useMemo(() => calculateLedgerMetrics(records), [records]);

  // Filter & Sort
  const filteredRecords = useMemo(() => {
    const list = filterRecords(records, {
      kind: kindFilter,
      search: searchTerm,
      category: categoryFilter,
      dateRange: dateRangeFilter
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortField === 'amount') cmp = a.amount - b.amount;
      else if (sortField === 'label') cmp = a.label.localeCompare(b.label);
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [records, kindFilter, searchTerm, categoryFilter, dateRangeFilter, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage]);

  const trendData = useMemo(() => getRevenueExpensesTrend(records, 14), [records]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingRecord(null);
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormLabel('');
    setFormKind('revenue');
    setFormAmount('');
    setFormCategory('General');
    setFormNotes('');
    setShowAddEditModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (rec: BusinessRecord) => {
    setEditingRecord(rec);
    setFormDate(rec.date);
    setFormLabel(rec.label);
    setFormKind(rec.kind);
    setFormAmount(rec.kind === 'lead' ? '0' : String(rec.amount));
    setFormCategory(rec.category || 'General');
    setFormNotes(rec.notes || '');
    setShowAddEditModal(true);
  };

  // Save Record (Add or Edit)
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = formLabel.trim();
    if (!label) return;

    const amount = formKind === 'lead' ? 0 : parseFloat(formAmount);
    if (formKind !== 'lead' && (!Number.isFinite(amount) || amount < 0)) return;

    if (editingRecord) {
      // Update existing
      const updated = records.map((r) =>
        r.id === editingRecord.id
          ? {
              ...r,
              date: formDate,
              label,
              kind: formKind,
              amount: amount || 0,
              category: formCategory.trim() || 'General',
              notes: formNotes.trim()
            }
          : r
      );
      await onUpdateRecords(updated);
    } else {
      // Create new
      const newRec: BusinessRecord = {
        id: crypto.randomUUID(),
        date: formDate || new Date().toISOString().slice(0, 10),
        label,
        kind: formKind,
        amount: amount || 0,
        category: formCategory.trim() || 'General',
        notes: formNotes.trim(),
        isSample: false
      };
      await onUpdateRecords([newRec, ...records]);
    }

    setShowAddEditModal(false);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingRecord) return;
    const remaining = records.filter((r) => r.id !== deletingRecord.id);
    await onUpdateRecords(remaining);
    setDeletingRecord(null);
  };

  // CSV Export
  const handleExportCsv = () => {
    const csvContent = exportRecordsToCsv(filteredRecords);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orbit-ledger-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { records: imported, errors } = parseCsvToRecords(text);

    if (errors.length > 0 && imported.length === 0) {
      setImportErrors(errors);
      setImportSuccessCount(null);
      return;
    }

    const merged = [...imported, ...records];
    await onUpdateRecords(merged);
    setImportSuccessCount(imported.length);
    setImportErrors(errors);
  };

  return (
    <div className="business-page">
      {/* Page Title */}
      <div className="page-intro">
        <div>
          <div className="eyebrow">REVENUE & OPERATIONS LEDGER</div>
          <h1>
            Business <span>Performance.</span>
          </h1>
          <p>
            Locally stored financial records and client acquisition signals. Not an automated ERP sync.
          </p>
        </div>

        <div className="section-actions">
          <button className="outline-button" onClick={handleExportCsv} disabled={records.length === 0}>
            <Download size={14} /> Export CSV
          </button>
          <button className="outline-button" onClick={() => setShowImportModal(true)}>
            <Upload size={14} /> Import CSV
          </button>
          <button className="primary-button" onClick={handleOpenAdd}>
            <Plus size={14} /> Add Record
          </button>
        </div>
      </div>

      {/* Financial Snapshot KPI Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span>Total Recorded Revenue</span>
            <TrendingUp size={16} />
          </div>
          <div className="metric-value">{formatCurrency(ledgerMetrics.revenue)}</div>
          <div className="metric-note">
            <span className="note-dot online" />
            <span>{records.filter((r) => r.kind === 'revenue').length} revenue transactions</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Total Recorded Expenses</span>
            <ArrowDownRight size={16} />
          </div>
          <div className="metric-value">{formatCurrency(ledgerMetrics.expenses)}</div>
          <div className="metric-note">
            <span className="note-dot text-danger" />
            <span>{records.filter((r) => r.kind === 'expense').length} expense transactions</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Net Recorded Income</span>
            <ArrowUpRight size={16} />
          </div>
          <div className={`metric-value ${ledgerMetrics.netIncome < 0 ? 'text-danger' : ''}`}>
            {formatCurrency(ledgerMetrics.netIncome)}
          </div>
          <div className="metric-note">
            <span className="note-dot online" />
            <span>Profit Margin: {ledgerMetrics.profitMargin.toFixed(1)}%</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Recorded Leads</span>
            <Activity size={16} />
          </div>
          <div className="metric-value">{ledgerMetrics.leads}</div>
          <div className="metric-note">
            <span className="note-dot online" />
            <span>Prospective clients / sales opportunities</span>
          </div>
        </div>
      </div>

      {/* Revenue vs Expenses Trend Chart */}
      {records.length > 0 && (
        <section className="panel chart-panel" style={{ marginBottom: '20px' }}>
          <div className="panel-head">
            <div>
              <h3>Revenue vs. Expenses Trend (Last 14 Days)</h3>
              <p>Visualizing daily cashflow patterns across your recorded entries.</p>
            </div>
            <span className="subtle-pill">
              <ShieldCheck size={12} /> Local Ledger
            </span>
          </div>

          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="bRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="bExpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f87171" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#242638" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="displayDate" tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#7d819b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#171827', border: '1px solid #32344b', borderRadius: 8, color: '#f4f3ff' }}
                  formatter={(v: any, name: any) => [
                    formatCurrency(Number(v)),
                    name === 'revenue' ? 'Revenue' : 'Expense'
                  ]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#a78bfa" strokeWidth={2} fill="url(#bRevGrad)" name="Revenue" />
                <Area type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={1.8} fill="url(#bExpGrad)" name="Expense" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Filter and Search Bar */}
      <div className="table-controls-bar">
        {/* Search */}
        <div className="table-search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search description, category, or notes..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm('')}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Kind Filter */}
        <div className="filter-pill-group">
          {(['all', 'revenue', 'expense', 'lead'] as const).map((k) => (
            <button
              key={k}
              className={`filter-pill ${kindFilter === k ? 'active' : ''}`}
              onClick={() => {
                setKindFilter(k);
                setCurrentPage(1);
              }}
            >
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>

        {/* Date Filter */}
        <select
          className="settings-input filter-select"
          value={dateRangeFilter}
          onChange={(e) => {
            setDateRangeFilter(e.target.value as any);
            setCurrentPage(1);
          }}
        >
          <option value="all">All Dates</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="this_year">This Year</option>
        </select>

        {/* Category Filter */}
        {existingCategories.length > 0 && (
          <select
            className="settings-input filter-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">All Categories</option>
            {existingCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Business Records Table */}
      <section className="panel records-panel">
        <div className="panel-head">
          <div>
            <h3>Transaction Ledger</h3>
            <p>Showing {filteredRecords.length} records</p>
          </div>
          <span className="subtle-pill">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {paginatedRecords.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (sortField === 'date') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortField('date');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    Date {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (sortField === 'label') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortField('label');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    Description {sortField === 'label' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Category</th>
                  <th>Type</th>
                  <th
                    style={{ cursor: 'pointer', textAlign: 'right' }}
                    onClick={() => {
                      if (sortField === 'amount') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortField('amount');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    Amount {sortField === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.date)}</td>
                    <td className="record-name">
                      <span>{r.label}</span>
                      {r.isSample && <span className="sample-tag-pill">Sample</span>}
                    </td>
                    <td>
                      <span className="category-pill">{r.category || 'General'}</span>
                    </td>
                    <td>
                      <span className={`type-pill ${r.kind}`}>{r.kind}</span>
                    </td>
                    <td className="amount" style={{ textAlign: 'right' }}>
                      {r.kind === 'lead' ? '—' : formatCurrency(r.amount)}
                    </td>
                    <td className="record-notes">{r.notes || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="icon-action-btn"
                        title="Edit record"
                        onClick={() => handleOpenEdit(r)}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="icon-action-btn delete"
                        title="Delete record"
                        onClick={() => setDeletingRecord(r)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <FileText size={24} />
            </div>
            <h3>No Records Match Filter</h3>
            <p>Try clearing your search query or adjusting your type and category filters.</p>
            <button className="primary-button" onClick={handleOpenAdd}>
              <Plus size={14} /> Add Transaction
            </button>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRecords.length)} of {filteredRecords.length}
            </span>
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="page-current">{currentPage}</span>
              <button
                className="pagination-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ADD / EDIT MODAL */}
      {showAddEditModal && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowAddEditModal(false)}>
          <form className="modal compact-modal" onSubmit={handleSaveRecord}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">LOCAL LEDGER</div>
                <h2>{editingRecord ? 'Edit Transaction' : 'Add Business Record'}</h2>
                <p>Saved securely to Orbit's local database on this PC.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowAddEditModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-body">
              <label className="field-label">Date</label>
              <input
                className="settings-input"
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />

              <label className="field-label">Description / Label</label>
              <input
                className="settings-input"
                type="text"
                required
                placeholder="e.g. Enterprise Software License"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />

              <div className="two-field-row">
                <div>
                  <label className="field-label">Type</label>
                  <select
                    className="settings-input"
                    value={formKind}
                    onChange={(e) => setFormKind(e.target.value as any)}
                  >
                    <option value="revenue">Revenue</option>
                    <option value="expense">Expense</option>
                    <option value="lead">Lead</option>
                  </select>
                </div>

                {formKind !== 'lead' && (
                  <div>
                    <label className="field-label">Amount (USD)</label>
                    <input
                      className="settings-input"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <label className="field-label">Category</label>
              <input
                className="settings-input"
                type="text"
                placeholder="e.g. Subscriptions, Hosting, Marketing"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              />

              <label className="field-label">Notes (Optional)</label>
              <textarea
                className="settings-input"
                rows={2}
                placeholder="Contract details, client reference, or invoice number"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            <div className="modal-footer">
              <span>Local storage only</span>
              <div className="inline-actions">
                <button type="button" className="outline-button" onClick={() => setShowAddEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  {editingRecord ? 'Save Changes' : 'Create Record'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deletingRecord && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDeletingRecord(null)}>
          <div className="modal compact-modal delete-modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow" style={{ color: '#f87171' }}>
                  CONFIRM DELETION
                </div>
                <h2>Delete Record?</h2>
              </div>
              <button className="icon-button" onClick={() => setDeletingRecord(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body-text">
              <p>
                Are you sure you want to permanently delete <strong>"{deletingRecord.label}"</strong> ({deletingRecord.kind === 'lead' ? 'Lead' : formatCurrency(deletingRecord.amount)})?
              </p>
              <p style={{ color: '#888ba4', fontSize: '11px' }}>This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="outline-button" onClick={() => setDeletingRecord(null)}>
                Cancel
              </button>
              <button className="danger-button" onClick={handleConfirmDelete}>
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showImportModal && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowImportModal(false)}>
          <div className="modal compact-modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">DATA INGESTION</div>
                <h2>Import Business Records from CSV</h2>
                <p>Upload a standard CSV file with columns for date, label, kind, amount, and category.</p>
              </div>
              <button className="icon-button" onClick={() => setShowImportModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="import-dropzone" onClick={() => fileInputRef.current?.click()}>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Upload size={32} style={{ color: '#a78bfa', marginBottom: '12px' }} />
              <h4>Click to select CSV file</h4>
              <p>Supports UTF-8 CSV exports from Excel, Stripe, QuickBooks, or custom spreadsheets.</p>
            </div>

            {importSuccessCount !== null && (
              <div className="toast success-toast" style={{ marginTop: '16px' }}>
                Successfully imported {importSuccessCount} business records!
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="error-box" style={{ marginTop: '16px', maxHeight: '120px', overflow: 'auto' }}>
                <strong>Import warnings:</strong>
                <ul>
                  {importErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-footer">
              <button className="primary-button" onClick={() => setShowImportModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

