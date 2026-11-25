'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  FileText,
  Upload,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Printer,
  X,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

interface ParsedLine {
  index: number;
  skuName: string;
  qtyOrdered: number;
  matched: boolean;
  matchConfidence: number;
  matchedSkuId?: string;
  suggestion?: string;
}

interface AllocationResult {
  rackId: string;
  skuName: string;
  qtyAllocated: number;
  expiredDate: string;
  expiredLabel: string;
  zone: string;
  sequence: number;
}

interface ConfirmedResult {
  pickingListNo: string;
  roNumber: string;
  customer: string;
  branch: string;
  roDate: string;
  ledgerEntries: number;
  allocations: AllocationResult[];
}

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

export default function OutboundPage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [parsing, setParsing] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocations, setAllocations] = useState<AllocationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RO confirmation dialog state
  const [roDialogOpen, setRoDialogOpen] = useState(false);
  const [roNumber, setRoNumber] = useState('');
  const [roCustomer, setRoCustomer] = useState('');
  const [roBranch, setRoBranch] = useState('');
  const [roDate, setRoDate] = useState(new Date().toISOString().slice(0, 10));
  const [roError, setRoError] = useState<string | null>(null);

  // Confirmed picking list state
  const [confirmed, setConfirmed] = useState<ConfirmedResult | null>(null);

  // Toast notifications
  const addToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  // Remove toast
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter to confirm allocation
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (allocations.length > 0 && !confirmed && allocations.length > 0) {
          e.preventDefault();
          openConfirmDialog();
        }
        if (confirmed) {
          e.preventDefault();
          handleExportExcel();
        }
      }
      // Escape to close dialog
      if (e.key === 'Escape') {
        setRoDialogOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allocations, confirmed]);

  // Parse quantity string with Indonesian formatting support
  function parseQty(raw: string): number {
    if (!raw) return NaN;
    const s = raw.trim();
    if (s.includes('.') && s.includes(',')) {
      return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    if (s.includes(',')) {
      return parseFloat(s.replace(',', '.'));
    }
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      return parseFloat(s.replace(/\./g, ''));
    }
    return parseFloat(s);
  }

  // Fuzzy match SKU name against catalog
  function fuzzyMatch(skuName: string, catalog: any[]) {
    const cleanInput = skuName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let best = { sku: null as any, score: 0 };
    
    for (const cat of catalog) {
      const cleanCat = cat.namaBarang.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanCat.includes(cleanInput) || cleanInput.includes(cleanCat)) {
        const score = cleanCat.length / Math.max(cleanInput.length, cleanCat.length);
        if (score > best.score) best = { sku: cat, score };
      }
    }
    return best;
  }

  // Parse PDF using pdfjs-dist with robust state-machine parser for Accurate exports
  async function parsePdf(file: File) {
    setParsing(true);
    setError(null);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str).join(' | ');
        fullText += strings + '\n';
      }

      const lines = fullText.split('\n').filter(l => l.trim().length > 3);
      const cells = lines.join(' | ').split('|').map(c => c.trim()).filter(c => c.length > 0);

      // Try to extract RO metadata from the PDF header
      const headerText = cells.join(' ');
      const roMatch = headerText.match(/(?:No\.?\s*(?:SO|RO|Order)|SO|RO)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})/i);
      if (roMatch && !roNumber) setRoNumber(roMatch[1].trim());

      const catalogRes = await fetch('/api/sku?action=names');
      const catalog = catalogRes.ok ? await catalogRes.json() : [];

      const startIdx = cells.findIndex(c => c.toLowerCase().includes('kuantitas') || c.toLowerCase().includes('pck'));
      const tableCells = startIdx !== -1 ? cells.slice(startIdx + 1) : cells;

      const rawItems: Record<string, number> = {};
      const unitKeywords = ['pcs', 'pack', 'dus', 'bks', 'jrg', 'ikat', 'dus40'];
      let currentItem = '';

      for (let i = 0; i < tableCells.length; i++) {
        const cell = tableCells[i];
        if (!cell) continue;
        if (cell.includes('ACCURATE') || cell.includes('Page Break') || cell.includes('Printed on') || cell.includes('Rincian')) continue;
        if (['nama barang', 'satuan', 'kuantitas', 'dus-20', 'jrg', 'pck'].includes(cell.toLowerCase())) continue;

        const num = parseQty(cell);
        const isUnit = unitKeywords.some(u => cell.toLowerCase().startsWith(u));

        if (!isNaN(num) && num > 0 && currentItem) {
          rawItems[currentItem] = (rawItems[currentItem] || 0) + num;
        } else if (!isUnit && isNaN(num) && cell.length > 1) {
          currentItem = cell;
        }
      }

      const parsed: ParsedLine[] = [];
      let index = 0;

      for (const [skuName, qtyOrdered] of Object.entries(rawItems)) {
        const match = fuzzyMatch(skuName, catalog);
        parsed.push({
          index: index++,
          skuName,
          qtyOrdered,
          matched: !!match.sku,
          matchConfidence: match.score,
          matchedSkuId: match.sku?.skuId,
          suggestion: match.sku?.namaBarang,
        });
      }
      
      setParsedLines(parsed);
      if (parsed.length === 0) {
        setError('Tidak ditemukan data order yang valid di PDF.');
        addToast('error', 'Tidak ditemukan data order yang valid di PDF.');
      } else {
        const matchedCount = parsed.filter(p => p.matched).length;
        setSuccess(`Berhasil mengekstrak ${parsed.length} baris order. ${matchedCount} cocok dengan katalog.`);
        addToast('success', `Berhasil mengekstrak ${parsed.length} baris order. ${matchedCount} cocok.`);
      }
    } catch (e) {
      const msg = 'Gagal parsing PDF: ' + (e as Error).message;
      setError(msg);
      addToast('error', msg);
    } finally {
      setParsing(false);
    }
  }

  // Allocate using FEFO + Rack sequencing
  async function handleAllocate() {
    setAllocating(true);
    setError(null);
    
    try {
      const linesToAllocate = parsedLines.filter(p => p.matched && p.matchedSkuId);
      if (linesToAllocate.length === 0) {
        setError('Tidak ada baris yang cocok dengan katalog. Periksa matching.');
        addToast('error', 'Tidak ada baris yang cocok dengan katalog.');
        return;
      }
      
      const res = await fetch('/api/outbound/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: linesToAllocate }),
      });
      
      if (!res.ok) throw new Error('Gagal alokasi');
      
      const data = await res.json();
      setAllocations(data.allocations);
      const msg = `Alokasi selesai: ${data.allocations.length} pick points dari ${linesToAllocate.length} SKU.`;
      setSuccess(msg);
      addToast('success', msg);
    } catch (e) {
      const msg = 'Gagal alokasi: ' + (e as Error).message;
      setError(msg);
      addToast('error', msg);
    } finally {
      setAllocating(false);
    }
  }

  // Open the RO dialog before confirming
  function openConfirmDialog() {
    setRoError(null);
    setRoDialogOpen(true);
  }

  // Confirm outbound - write to Ledger + Picking List with RO details
  async function handleConfirm() {
    setRoError(null);
    if (!roNumber.trim()) {
      setRoError('RO Number wajib diisi');
      return;
    }

    setAllocating(true);
    
    try {
      const res = await fetch('/api/outbound/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations,
          roNumber: roNumber.trim(),
          customer: roCustomer.trim(),
          branch: roBranch.trim(),
          roDate,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal konfirmasi');
      
      setConfirmed({
        pickingListNo: data.pickingListNo,
        roNumber: data.roNumber,
        customer: data.customer,
        branch: data.branch,
        roDate: data.roDate,
        ledgerEntries: data.ledgerEntries,
        allocations,
      });

      setRoDialogOpen(false);
      const msg = `Outbound dikonfirmasi! Picking List #${data.pickingListNo} untuk RO ${data.roNumber} dibuat.`;
      setSuccess(msg);
      addToast('success', msg);
      
      // Keep allocations for the export view but clear the upload step
      setParsedLines([]);
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      const msg = 'Gagal konfirmasi: ' + (e as Error).message;
      setRoError(msg);
      addToast('error', msg);
    } finally {
      setAllocating(false);
    }
  }

  // Download Excel export of the confirmed picking list
  function handleExportExcel() {
    if (!confirmed) return;
    window.open(`/api/outbound/export/${encodeURIComponent(confirmed.pickingListNo)}`, '_blank');
  }

  // Start a new outbound after confirming
  function handleNewOutbound() {
    setConfirmed(null);
    setAllocations([]);
    setParsedLines([]);
    setPdfFile(null);
    setRoNumber('');
    setRoCustomer('');
    setRoBranch('');
    setRoDate(new Date().toISOString().slice(0, 10));
    setSuccess(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setError(null);
      setSuccess(null);
      setAllocations([]);
      setConfirmed(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setError(null);
      setSuccess(null);
      setAllocations([]);
      setConfirmed(null);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  const totalQty = allocations.reduce((s, a) => s + a.qtyAllocated, 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6" /> Outbound & Picking List
      </h1>

      {/* Toasts */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg shadow-lg border min-w-[350px] max-w-md ${
              t.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-destructive" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 opacity-50 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmed Result View */}
      {confirmed ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" /> Picking List Berhasil Dibuat
              </span>
              <div className="flex gap-2">
                <Button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-700">
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
                <Button variant="outline" onClick={handleNewOutbound}>
                  <Upload className="mr-2 h-4 w-4" /> Outbound Baru
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* RO Header Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Picking List No</p>
                <p className="font-mono font-semibold">{confirmed.pickingListNo}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">RO Number</p>
                <p className="font-semibold">{confirmed.roNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer / Branch</p>
                <p className="font-semibold">{confirmed.customer || '-'} {confirmed.branch ? `(${confirmed.branch})` : ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">RO Date</p>
                <p className="font-semibold">{confirmed.roDate}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {confirmed.allocations.length} pick points &middot; Total Qty: <span className="font-bold text-foreground">{confirmed.allocations.reduce((s, a) => s + a.qtyAllocated, 0)}</span>
              </p>
              <p className="text-sm text-muted-foreground">{confirmed.ledgerEntries} entri Ledger tercatat</p>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seq</TableHead>
                    <TableHead>Rak</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Qty Pick</TableHead>
                    <TableHead>Expired</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {confirmed.allocations.map((a, i) => (
                    <TableRow key={`${a.rackId}-${a.skuName}-${i}`}>
                      <TableCell className="font-mono">{a.sequence}</TableCell>
                      <TableCell className="font-medium">{a.rackId}</TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted">{a.zone}</span>
                      </TableCell>
                      <TableCell>{a.skuName}</TableCell>
                      <TableCell className="font-bold">{a.qtyAllocated}</TableCell>
                      <TableCell>{a.expiredLabel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Step 1: PDF Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                1. Upload Rekap Order (PDF dari Accurate)
                {pdfFile && <span className="text-sm font-normal text-muted-foreground">{pdfFile.name}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="pdf-upload"
                />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-lg font-medium">Drag & Drop PDF di sini</p>
                  <p className="text-sm text-muted-foreground">atau klik untuk browse</p>
                </label>
              </div>

              {pdfFile && !parsing && (
                <Button onClick={() => parsePdf(pdfFile!)} disabled={parsing} className="w-full">
                  <FileText className="mr-2 h-4 w-4" />
                  Parse & Ekstrak Data
                </Button>
              )}

              {parsing && <div className="flex justify-center gap-2"><Loader2 className="animate-spin" /><span>Memproses PDF...</span></div>}
            </CardContent>
          </Card>

          {/* Step 2: Parsed Lines Preview & Manual Edit */}
          {parsedLines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  2. Review & Matching SKU ({parsedLines.filter(p => p.matched).length}/{parsedLines.length} matched)
                  {parsedLines.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setParsedLines([]); setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                      <Trash2 className="mr-1 h-4 w-4" /> Hapus Semua
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Nama Barang (dari PDF)</TableHead>
                        <TableHead>Qty Order</TableHead>
                        <TableHead>Status Match</TableHead>
                        <TableHead>Saran Katalog</TableHead>
                        <TableHead>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedLines.map((line) => (
                        <TableRow key={line.index} className={!line.matched ? 'bg-destructive/5' : ''}>
                          <TableCell>{line.index + 1}</TableCell>
                          <TableCell>
                            <Input
                              value={line.skuName}
                              onChange={(e) => setParsedLines(parsedLines.map(p => p.index === line.index ? { ...p, skuName: e.target.value, matched: false } : p))}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={line.qtyOrdered}
                              onChange={(e) => setParsedLines(parsedLines.map(p => p.index === line.index ? { ...p, qtyOrdered: parseFloat(e.target.value) || 0 } : p))}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            {line.matched ? (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>{(line.matchConfidence * 100).toFixed(0)}%</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-600">
                                <AlertTriangle className="h-4 w-4" />
                                <span>Belum match</span>
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.suggestion || '-'}
                          </TableCell>
                          <TableCell>
                            {!line.matched && (
                              <Button variant="outline" size="sm" onClick={() => {}}>
                                Cari
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {parsedLines.some(p => p.matched) && (
                  <Button onClick={handleAllocate} disabled={allocating} className="w-full mt-4">
                    {allocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                    {allocating ? 'Mengalokasikan...' : 'Alokasikan (FEFO + Rack Sequence)'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Allocation Results */}
          {allocations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  3. Hasil Alokasi & Urutan Pick ({allocations.length} pick points)
                  <Button onClick={openConfirmDialog} disabled={allocating}>
                    {allocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Konfirmasi Outbound
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seq</TableHead>
                        <TableHead>Rak</TableHead>
                        <TableHead>Zona</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Qty Pick</TableHead>
                        <TableHead>Expired</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations.map((a, i) => (
                        <TableRow key={`${a.rackId}-${a.skuName}-${i}`}>
                          <TableCell className="font-mono">{a.sequence}</TableCell>
                          <TableCell className="font-medium">{a.rackId}</TableCell>
                          <TableCell>
                            <span className="text-xs px-2 py-0.5 rounded bg-muted">{a.zone}</span>
                          </TableCell>
                          <TableCell>{a.skuName}</TableCell>
                          <TableCell className="font-bold">{a.qtyAllocated}</TableCell>
                          <TableCell>{a.expiredLabel}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {error && <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg">{error}</div>}
      {success && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">{success}</div>}

      {/* RO Details Dialog */}
      <Dialog open={roDialogOpen} onOpenChange={setRoDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Detail RO untuk Picking List</DialogTitle>
            <DialogDescription>
              Isi detail Rekap Order sebelum membuat Picking List. Informasi ini akan tercetak pada Excel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ro-number">RO Number <span className="text-destructive">*</span></Label>
              <Input
                id="ro-number"
                value={roNumber}
                onChange={(e) => setRoNumber(e.target.value)}
                placeholder="mis. SO-VIT-2026-00123"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ro-customer">Customer</Label>
                <Input
                  id="ro-customer"
                  value={roCustomer}
                  onChange={(e) => setRoCustomer(e.target.value)}
                  placeholder="mis. PT Bangor Berkembang Bersama"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ro-branch">Branch / Cabang</Label>
                <Input
                  id="ro-branch"
                  value={roBranch}
                  onChange={(e) => setRoBranch(e.target.value)}
                  placeholder="mis. Vittoria"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ro-date">Tanggal RO</Label>
              <Input
                id="ro-date"
                type="date"
                value={roDate}
                onChange={(e) => setRoDate(e.target.value)}
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{allocations.length}</span> pick points &middot; Total Qty{' '}
                <span className="font-semibold text-foreground">{totalQty}</span>
              </p>
            </div>

            {roError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                {roError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoDialogOpen(false)} disabled={allocating}>
              Batal
            </Button>
            <Button onClick={handleConfirm} disabled={allocating || !roNumber.trim()}>
              {allocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {allocating ? 'Memproses...' : 'Konfirmasi & Buat Picking List'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}