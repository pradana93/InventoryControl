'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, FileText, Upload, Download, Trash2, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
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

export default function OutboundPage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [parsing, setParsing] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocations, setAllocations] = useState<AllocationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Parse PDF using pdfjs-dist
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
        const strings = content.items.map((item: any) => item.str).join(' ');
        fullText += strings + '\n';
      }

      // Parse lines looking for SKU patterns
      const lines = fullText.split('\n').filter(l => l.trim().length > 3);
      const parsed: ParsedLine[] = [];
      
      // Try to find table-like structures with SKU + Qty
      // Common Accurate format: "Nama Barang" | "Qty" or similar
      const catalogRes = await fetch('/api/sku?action=names');
      const catalog = catalogRes.ok ? await catalogRes.json() : [];
      
      let index = 0;
      for (const line of lines) {
        // Look for patterns: SKU name followed by number (qty)
        // This is heuristic - will need tuning based on actual PDF format
        const qtyMatch = line.match(/(\d+[.,]?\d*)\s*$/);
        const skuPart = qtyMatch ? line.slice(0, qtyMatch.index).trim() : line;
        
        if (skuPart.length > 2 && qtyMatch) {
          const qty = parseFloat(qtyMatch[1].replace(',', '.'));
          if (!isNaN(qty) && qty > 0) {
            const match = fuzzyMatch(skuPart, catalog);
            parsed.push({
              index: index++,
              skuName: skuPart,
              qtyOrdered: qty,
              matched: !!match.sku,
              matchConfidence: match.score,
              matchedSkuId: match.sku?.skuId,
              suggestion: match.sku?.namaBarang,
            });
          }
        }
      }
      
      if (parsed.length === 0) {
        // Fallback: try to extract any product-like lines
        for (const line of lines) {
          const parts = line.split(/\s{2,}|\t/).filter(p => p.trim());
          if (parts.length >= 2) {
            const lastPart = parts[parts.length - 1];
            const qty = parseFloat(lastPart.replace(',', '.'));
            const skuPart = parts.slice(0, -1).join(' ');
            if (!isNaN(qty) && qty > 0 && skuPart.length > 2) {
              const match = fuzzyMatch(skuPart, catalog);
              parsed.push({
                index: index++,
                skuName: skuPart,
                qtyOrdered: qty,
                matched: !!match.sku,
                matchConfidence: match.score,
                matchedSkuId: match.sku?.skuId,
                suggestion: match.sku?.namaBarang,
              });
            }
          }
        }
      }
      
      setParsedLines(parsed);
      if (parsed.length === 0) {
        setError('Tidak ditemukan data order yang valid di PDF. Coba format lain atau masukkan manual.');
      } else {
        setSuccess(`Berhasil mengekstrak ${parsed.length} baris order. ${parsed.filter(p => p.matched).length} cocok dengan katalog.`);
      }
    } catch (e) {
      setError('Gagal parsing PDF: ' + (e as Error).message);
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
      setSuccess(`Alokasi selesai: ${data.allocations.length} pick points dari ${linesToAllocate.length} SKU.`);
    } catch (e) {
      setError('Gagal alokasi: ' + (e as Error).message);
    } finally {
      setAllocating(false);
    }
  }

  // Confirm outbound - write to Ledger + Picking List
  async function handleConfirm() {
    setAllocating(true);
    
    try {
      const res = await fetch('/api/outbound/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations }),
      });
      
      if (!res.ok) throw new Error('Gagal konfirmasi');
      
      const data = await res.json();
      setSuccess(`Outbound dikonfirmasi! Picking List #${data.pickingListNo} dibuat. ${data.ledgerEntries} entri Ledger ditulis.`);
      
      // Reset form
      setParsedLines([]);
      setAllocations([]);
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError('Gagal konfirmasi: ' + (e as Error).message);
    } finally {
      setAllocating(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setError(null);
      setSuccess(null);
      setAllocations([]);
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
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6" /> Outbound & Picking List
      </h1>

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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                          <Button variant="outline" size="sm" onClick={() => {
                            // Manual search could be added here
                          }}>
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
              <Button onClick={handleConfirm} disabled={allocating}>
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

      {error && <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg">{error}</div>}
      {success && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">{success}</div>}
    </div>
  );
}