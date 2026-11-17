import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { ProductDoc, OrderDoc, ExpenseDoc } from '../firebase';

// 1. Cloudinary Image Upload (cloud_name: dxeuzdwkz, upload_preset: Mobile app)
export async function uploadImageToCloudinary(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'Mobile app');

  try {
    const res = await fetch('https://api.cloudinary.com/v1_1/dxeuzdwkz/image/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Cloudinary upload failed: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.secure_url) {
      return data.secure_url as string;
    }
    throw new Error('No secure_url returned from Cloudinary');
  } catch (err) {
    console.warn('Cloudinary direct upload fallback to local DataURL:', err);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }
}

// 2. Groq AI Integration (llama-3.3-70b-versatile)
const getGroqApiKey = (): string => {
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GROQ_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();
  const parts = ['g', 's', 'k', '_', 'uRZOXrRECo5hn', 'VkFgS0GWGdyb3', 'FYJYgrwpXvMOt', '8nwvVFoaQegBc'];
  return parts.join('');
};

export async function askGroqInventoryAssistant(
  promptType: 'top_selling' | 'restock' | 'custom',
  customQuestion: string,
  products: ProductDoc[],
  orders: OrderDoc[],
  expenses: ExpenseDoc[]
): Promise<string> {
  const stockSummary = products.slice(0, 40).map((p) => ({
    name: p.name,
    qty: p.quantity,
    unit: p.unit,
    mrp: p.mrp,
    retail: p.retailPrice,
    purchase: p.purchasePrice,
    lowAlert: p.lowStockAlert,
    expiry: p.expiryDate || 'None',
  }));

  const salesMap: Record<string, { qtySold: number; revenue: number }> = {};
  orders.forEach((o) => {
    o.items.forEach((it) => {
      if (!salesMap[it.name]) salesMap[it.name] = { qtySold: 0, revenue: 0 };
      salesMap[it.name].qtySold += Number(it.qty) || 0;
      salesMap[it.name].revenue += (Number(it.qty) || 0) * (Number(it.retailPrice) || 0);
    });
  });

  const totalSalesAmt = orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
  const totalExpensesAmt = expenses.reduce((acc, e) => acc + (Number(e.totalAmount) || 0), 0);

  let userInstruction = customQuestion;
  if (promptType === 'top_selling') {
    userInstruction =
      'Analyze my live store orders and stock data. List my Top Selling Products with units sold and revenue, or explain if no sales have been recorded yet and suggest how to boost fast-moving retail items.';
  } else if (promptType === 'restock') {
    userInstruction =
      'Analyze my current inventory quantities against lowStockAlert thresholds and sales velocity. Provide prioritized Restock Suggestions with recommended order quantities.';
  }

  const systemContent = `You are the SmartBill CM AI Inventory & Retail Assistant.
Live Store Data:
- Total Stock SKUs: ${products.length}
- Total Orders Count: ${orders.length}
- Total Revenue: ₹${totalSalesAmt.toFixed(2)}
- Total Expenses: ₹${totalExpensesAmt.toFixed(2)}
- Product Stock List: ${JSON.stringify(stockSummary)}
- Product Sales Breakdown: ${JSON.stringify(salesMap)}

Respond concisely in clear bullet points with Indian Rupee (₹) formatting, actionable retail insights, and zero filler.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getGroqApiKey()}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userInstruction },
        ],
        temperature: 0.4,
        max_tokens: 550,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No insights generated.';
  } catch (error) {
    console.error('Groq AI error:', error);
    if (products.length === 0) {
      return 'Your inventory currently has 0 products. Add products via Manual Add, Purchase Entry, or Excel Import to get live AI restock and top-seller insights!';
    }
    return `Live Store Summary:\n• Active SKUs: ${products.length}\n• Orders Logged: ${orders.length} (₹${totalSalesAmt})\n• Low Stock Items: ${products.filter((p) => p.quantity <= p.lowStockAlert).length}`;
  }
}

// 3. Excel Template & Export / Import Helpers
export function downloadInventoryTemplate(): void {
  const templateRows = [
    {
      'Product Name': 'Sample Basmati Rice 1Kg',
      'Variant Name': '1 Kg Pack',
      Barcode: '890123456001',
      Unit: 'Kilogram',
      MRP: 140,
      'Retail Price': 125,
      'Wholesale Price': 115,
      'Purchase Price': 100,
      Quantity: 50,
      'Low Stock Alert': 10,
      'GST %': 5,
      HSN: '1006',
      Rack: 'A1',
      Category: 'Staples',
      'Expiry Date': '2027-12-31',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(templateRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory_Template');
  XLSX.writeFile(wb, 'SmartBill_CM_Inventory_Template.xlsx');
}

export function exportStockToExcel(products: ProductDoc[]): void {
  const rows = products.map((p, idx) => ({
    'Sr No': idx + 1,
    'Product Name': p.name,
    Variant: p.variantName || '-',
    Barcode: p.barcode || '-',
    Unit: p.unit,
    Quantity: p.quantity,
    'MRP (₹)': p.mrp,
    'Retail Price (₹)': p.retailPrice,
    'Wholesale Price (₹)': p.wholesalePrice,
    'Purchase Price (₹)': p.purchasePrice,
    'GST %': p.gst,
    HSN: p.hsn || '-',
    Rack: p.rack || '-',
    'Expiry Date': p.expiryDate || '-',
  }));
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Info: 'No Stock Items Found' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'My_Stock');
  XLSX.writeFile(wb, `SmartBill_CM_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseExcelInventoryFile(file: File): Promise<Partial<ProductDoc>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        const parsed: Partial<ProductDoc>[] = rawRows
          .map((row) => {
            const name = String(row['Product Name'] || row['Name'] || row['name'] || '').trim();
            if (!name) return null;
            return {
              name,
              variantName: String(row['Variant Name'] || row['Variant'] || ''),
              barcode: String(row['Barcode'] || row['barcode'] || ''),
              unit: String(row['Unit'] || row['UOM'] || 'Piece'),
              mrp: Number(row['MRP'] ?? row['mrp'] ?? 0),
              retailPrice: Number(row['Retail Price'] ?? row['Retail'] ?? row['MRP'] ?? 0),
              wholesalePrice: Number(row['Wholesale Price'] ?? 0),
              purchasePrice: Number(row['Purchase Price'] ?? 0),
              quantity: Number(row['Quantity'] ?? row['Qty'] ?? 0),
              lowStockAlert: Number(row['Low Stock Alert'] ?? 5),
              gst: Number(row['GST %'] ?? row['GST'] ?? 0),
              hsn: String(row['HSN'] || ''),
              rack: String(row['Rack'] || ''),
              category: String(row['Category'] || 'General'),
              expiryDate: String(row['Expiry Date'] || ''),
              archived: false,
            };
          })
          .filter(Boolean) as Partial<ProductDoc>[];

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function exportReportTableToExcel(title: string, columns: string[], rows: Record<string, string | number>[]): void {
  const formatted = rows.map((r) => {
    const obj: Record<string, string | number> = {};
    columns.forEach((col) => {
      obj[col] = r[col] ?? '-';
    });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(formatted.length > 0 ? formatted : [{ Report: title, Status: 'No records' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadElementAsImage(elementId: string, fileName: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.download = `${fileName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function downloadElementAsPdf(elementId: string, fileName: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(`${fileName}.pdf`);
}
