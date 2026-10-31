/**
 * An employee earnings statement (pay stub) for one payment. Pure layout:
 * every figure comes from buildPayStub (lib/payStub.ts). Rendered as a
 * white paper document in both themes, and printable as is.
 */
import type { PayStubData } from "@/lib/payStub";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} hundred` : "", rest].filter(Boolean).join(" ");
}
/** 1234.5 -> "One thousand two hundred thirty-four and 50/100 dollars", as written on a check. */
export function amountInWords(amount: number): string {
  const dollars = Math.floor(Math.round(amount * 100) / 100);
  const centsPart = Math.round((amount - dollars) * 100);
  const groups: Array<[number, string]> = [
    [Math.floor(dollars / 1_000_000) % 1000, "million"],
    [Math.floor(dollars / 1000) % 1000, "thousand"],
    [dollars % 1000, ""],
  ];
  const words = groups
    .filter(([v]) => v > 0)
    .map(([v, unit]) => `${under1000(v)}${unit ? ` ${unit}` : ""}`)
    .join(" ") || "zero";
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} and ${String(centsPart).padStart(2, "0")}/100 dollars`;
}

export interface PayStubCompany {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
}

export interface PayStubEmployee {
  id: string;
  /** EMP-0001. The stub shows no number line until one exists. */
  employeeNumber: string | null;
  name: string;
  address: string | null;
  jobTitle: string | null;
  ssnLast4: string | null;
  payType: "hourly" | "daily";
  rate: number;
  payFrequency: "weekly" | "biweekly";
}

const TH = "py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600";
const TD = "py-1.5 align-top";

export function PayStub({ stub, company, employee }: { stub: PayStubData; company: PayStubCompany; employee: PayStubEmployee }) {
  // Only a real check or transfer number; never a made-up one.
  const checkNo = stub.reference || "Not recorded";
  return (
    <div className="mx-auto w-full max-w-[800px] bg-white text-[12px] leading-snug text-neutral-900 [color-scheme:light]">
      {/* Header: employer, and what this document is. */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-3">
        <div className="min-w-0">
          <div className="text-[17px] font-bold">{company.name}</div>
          {company.address && <div className="whitespace-pre-line">{company.address}</div>}
          {(company.phone || company.email) && <div>{[company.phone, company.email].filter(Boolean).join(" · ")}</div>}
          {company.taxId && <div>EIN {company.taxId}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-bold uppercase tracking-wide">Earnings statement</div>
          <table className="ml-auto mt-1 text-[11px]">
            <tbody>
              <tr><td className="pr-3 text-neutral-600">Pay date</td><td className="font-semibold">{longDate(stub.payDate)}</td></tr>
              <tr><td className="pr-3 text-neutral-600">Pay period</td><td>{stub.periodStart && stub.periodEnd ? `${longDate(stub.periodStart)} – ${longDate(stub.periodEnd)}` : "—"}</td></tr>
              <tr><td className="pr-3 text-neutral-600">{stub.method.toLowerCase().startsWith("check") ? "Check no." : "Reference"}</td><td>{checkNo}</td></tr>
              <tr><td className="pr-3 text-neutral-600">Paid by</td><td>{stub.method}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {stub.reversed && (
        <div className="mt-3 border-2 border-neutral-900 px-3 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide">
          Void — this payment was reversed{stub.reversalReason ? `: ${stub.reversalReason}` : ""}
        </div>
      )}

      {/* Employee and pay basis. */}
      <div className="mt-3 grid grid-cols-2 gap-6 border-b border-neutral-300 pb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Employee</div>
          <div className="text-[13px] font-semibold">{employee.name}</div>
          {employee.address && <div>{employee.address}</div>}
        </div>
        <table className="text-[11px]">
          <tbody>
            {/* Only a real employee number (EMP-0001); never the internal record id. */}
            {employee.employeeNumber && <tr><td className="pr-3 text-neutral-600">Employee no.</td><td>{employee.employeeNumber}</td></tr>}
            {employee.ssnLast4 && <tr><td className="pr-3 text-neutral-600">SSN</td><td>XXX-XX-{employee.ssnLast4}</td></tr>}
            {employee.jobTitle && <tr><td className="pr-3 text-neutral-600">Position</td><td>{employee.jobTitle}</td></tr>}
            <tr><td className="pr-3 text-neutral-600">Pay rate</td><td>{money(employee.rate)} {employee.payType === "daily" ? "per day" : "per hour"}</td></tr>
            <tr><td className="pr-3 text-neutral-600">Pay frequency</td><td>{employee.payFrequency === "weekly" ? "Weekly" : "Every two weeks"}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Earnings. */}
      <table className="mt-3 w-full">
        <thead>
          <tr className="border-b border-neutral-900">
            <th className={TH}>Earnings</th>
            <th className={TH}>Description</th>
            <th className={`${TH} text-right`}>{employee.payType === "daily" ? "Hours" : "Hours"}</th>
            <th className={`${TH} text-right`}>Rate</th>
            <th className={`${TH} text-right`}>This period</th>
            <th className={`${TH} text-right`}>Year to date</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {stub.earnings.map((e, i) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className={TD}>{e.kind}</td>
              <td className={TD}>{e.description}</td>
              <td className={`${TD} text-right`}>{e.hours !== null ? num(e.hours) : ""}</td>
              <td className={`${TD} text-right`}>{e.rate !== null ? num(e.rate) : ""}</td>
              <td className={`${TD} text-right`}>{num(e.current)}</td>
              <td className={`${TD} text-right text-neutral-500`}>{i === stub.earnings.findIndex((x) => x.kind === e.kind) ? num(stub.ytd.byKind[e.kind] ?? 0) : ""}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className={TD} colSpan={2}>Gross pay</td>
            <td className={`${TD} text-right`}>{stub.current.hours ? num(stub.current.hours) : ""}</td>
            <td className={TD} />
            <td className={`${TD} text-right`}>{num(stub.current.gross)}</td>
            <td className={`${TD} text-right`}>{num(stub.ytd.gross)}</td>
          </tr>
        </tbody>
      </table>

      {/* Taxes and deductions: shown, and stated plainly when there are none. */}
      <table className="mt-3 w-full">
        <thead>
          <tr className="border-b border-neutral-900">
            <th className={TH}>Taxes and deductions</th>
            <th className={`${TH} text-right`}>This period</th>
            <th className={`${TH} text-right`}>Year to date</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-b border-neutral-200">
            <td className={`${TD} text-neutral-600`}>None withheld</td>
            <td className={`${TD} text-right`}>{num(stub.current.deductions)}</td>
            <td className={`${TD} text-right`}>{num(stub.ytd.deductions)}</td>
          </tr>
        </tbody>
      </table>

      {stub.reimbursements.length > 0 && (
        <table className="mt-3 w-full">
          <thead>
            <tr className="border-b border-neutral-900">
              <th className={TH}>Reimbursements (not taxable wages)</th>
              <th className={`${TH} text-right`}>This period</th>
              <th className={`${TH} text-right`}>Year to date</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {stub.reimbursements.map((r, i) => (
              <tr key={i} className="border-b border-neutral-200">
                <td className={TD}>{r.description}</td>
                <td className={`${TD} text-right`}>{num(r.amount)}</td>
                <td className={`${TD} text-right text-neutral-500`}>{i === 0 ? num(stub.ytd.reimbursements) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Summary. */}
      <table className="mt-4 w-full border border-neutral-900 tabular-nums">
        <thead>
          <tr className="bg-neutral-100">
            <th className={`${TH} px-3`} />
            <th className={`${TH} px-3 text-right`}>Gross pay</th>
            <th className={`${TH} px-3 text-right`}>Deductions</th>
            {stub.current.reimbursements > 0 || stub.ytd.reimbursements > 0 ? <th className={`${TH} px-3 text-right`}>Reimbursements</th> : null}
            <th className={`${TH} px-3 text-right`}>Net pay</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-neutral-300">
            <td className="px-3 py-1.5 font-semibold">This period</td>
            <td className="px-3 py-1.5 text-right">{num(stub.current.gross)}</td>
            <td className="px-3 py-1.5 text-right">{num(stub.current.deductions)}</td>
            {stub.current.reimbursements > 0 || stub.ytd.reimbursements > 0 ? <td className="px-3 py-1.5 text-right">{num(stub.current.reimbursements)}</td> : null}
            <td className="px-3 py-1.5 text-right text-[14px] font-bold">{money(stub.current.net)}</td>
          </tr>
          <tr className="border-t border-neutral-300 text-neutral-700">
            <td className="px-3 py-1.5 font-semibold">Year to date</td>
            <td className="px-3 py-1.5 text-right">{num(stub.ytd.gross)}</td>
            <td className="px-3 py-1.5 text-right">{num(stub.ytd.deductions)}</td>
            {stub.current.reimbursements > 0 || stub.ytd.reimbursements > 0 ? <td className="px-3 py-1.5 text-right">{num(stub.ytd.reimbursements)}</td> : null}
            <td className="px-3 py-1.5 text-right font-semibold">{money(stub.ytd.net)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-[10px] text-neutral-600">
        No federal, state, Social Security or Medicare taxes were withheld from this payment by {company.name}. Keep this statement for your
        records.
      </p>

      {/* Voucher: the stub's detachable half. */}
      <div className="mt-6 border-t-2 border-dashed border-neutral-400 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="text-[13px] font-bold">{company.name}</div>
          <div className="text-right text-[11px]">
            <div>{stub.method.toLowerCase().startsWith("check") ? "Check no." : "Reference"} <span className="font-semibold">{checkNo}</span></div>
            <div>Date <span className="font-semibold">{longDate(stub.payDate)}</span></div>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-4 border-b border-neutral-900 pb-1">
          <div className="text-[11px]">
            Pay to the order of <span className="text-[13px] font-semibold">{employee.name}</span>
          </div>
          <div className="border border-neutral-900 px-3 py-1 text-[14px] font-bold tabular-nums">{money(stub.current.net)}</div>
        </div>
        <div className="mt-2 border-b border-neutral-900 pb-1 text-[11px]">{amountInWords(stub.current.net)}</div>
        <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">Non-negotiable · This is not a check</div>
      </div>
    </div>
  );
}
