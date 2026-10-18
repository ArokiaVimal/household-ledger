// Finds the transaction table inside a parsed statement file and says which column is which.
export interface ColumnMap {
  date: number;
  description: number;
  postedDate?: number;
  debit?: number;
  credit?: number;
  amount?: number;
  balance?: number;
  reference?: number;
  drcr?: number;
}
export interface Layout { headerIndex: number; columns: ColumnMap; headers: string[] }

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const SYN: Record<keyof ColumnMap, string[]> = {
  date: ["date", "txndate", "transactiondate", "trandate", "transdate", "tdate", "dateoftransaction", "purchasedate"],
  postedDate: ["valuedate", "valuedt", "postdate", "postingdate", "posteddate", "settlementdate"],
  description: ["narration", "description", "particulars", "transactiondetails", "details", "transactiondescription", "remarks", "merchantname", "merchant", "transactionremarks"],
  debit: ["debit", "debitamount", "withdrawal", "withdrawalamt", "withdrawalamount", "withdrawals", "dr", "debits", "amountdebited", "debitamt", "debitamountinr", "withdrawalamountinr", "withdrawalamtinr", "debitinr"],
  credit: ["credit", "creditamount", "deposit", "depositamt", "depositamount", "deposits", "cr", "credits", "amountcredited", "creditamt", "creditamountinr", "depositamountinr", "depositamtinr", "creditinr"],
  amount: ["amount", "txnamount", "transactionamount", "amountinr", "amt", "amountrs", "amountinrs", "transactionamountinr"],
  balance: ["balance", "closingbalance", "runningbalance", "balanceinr", "availablebalance"],
  reference: ["chqrefno", "chqrefnumber", "refno", "referenceno", "referencenumber", "reference", "utr", "utrno", "transactionid", "txnid", "chequeno", "refnochequeno", "chequerefno", "refnumber"],
  drcr: ["drcr", "crdr", "type", "transactiontype", "dc", "debitcredit", "cdindicator"],
};

function mapRow(cells: string[]): ColumnMap | null {
  const found: Partial<ColumnMap> = {};
  cells.forEach((cell, i) => {
    const n = norm(cell);
    if (!n) return;
    for (const key of Object.keys(SYN) as (keyof ColumnMap)[]) if (found[key] === undefined && SYN[key].includes(n)) { found[key] = i; break; }
  });
  if (found.date === undefined || found.description === undefined) return null;
  if (found.amount === undefined && found.debit === undefined && found.credit === undefined) return null;
  return found as ColumnMap;
}

/** Looks through the first rows for a recognisable header (statements often start with account details). */
export function detectLayout(table: string[][], scanRows = 60): Layout | null {
  for (let i = 0; i < Math.min(table.length, scanRows); i++) {
    const columns = mapRow(table[i]);
    if (columns) return { headerIndex: i, columns, headers: table[i] };
  }
  return null;
}
