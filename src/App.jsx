import React, { useEffect, useMemo, useRef, useState } from "react";

const TZ = "Europe/Stockholm";

function toZonedDate(date = new Date()) {
  return new Date(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .format(date)
      .replace(/(\d{4})\.(\d{2})\.(\d{2}),\s(\d{2}):(\d{2}):(\d{2})/, "$1-$2-$3T$4:$5:$6+01:00")
  );
}

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}
const addDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const isWeekend = (d) => [0,6].includes(d.getDay());

function swedishHolidaySet(year) {
  const set = new Set();
  set.add(new Date(year,0,1).toDateString());  // Nyårsdagen
  set.add(new Date(year,0,6).toDateString());  // Trettondedag jul
  set.add(new Date(year,4,1).toDateString());  // Första maj
  set.add(new Date(year,5,6).toDateString());  // Nationaldagen
  set.add(new Date(year,11,25).toDateString()); // Juldagen
  set.add(new Date(year,11,26).toDateString()); // Annandag jul
  const easter = easterSunday(year);
  [addDays(easter,-2), addDays(easter,1), addDays(easter,39)].forEach(d => set.add(d.toDateString())); // Långfredag, Annandag påsk, Kristi Himm.
  return set;
}

function countWorkingDaysInYear(year) {
  const holidays = swedishHolidaySet(year);
  let count = 0, d = new Date(year,0,1);
  while (d.getFullYear() === year) {
    if (!isWeekend(d) && !holidays.has(d.toDateString())) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function workdayWindow(date) {
  const start = new Date(date); start.setHours(9,0,0,0);
  const end   = new Date(date); end.setHours(17,0,0,0);
  return { start, end };
}

function isWorkday(date) {
  const y = date.getFullYear();
  return !isWeekend(date) && !swedishHolidaySet(y).has(new Date(y, date.getMonth(), date.getDate()).toDateString());
}

function secondsWorkedSoFarToday(now) {
  if (!isWorkday(now)) return 0;
  const { start, end } = workdayWindow(now);
  if (now <= start) return 0;
  if (now >= end) return 8 * 3600;
  return Math.floor((now - start) / 1000);
}

const fmtSEK = (n) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 2 }).format(n);
const fmtPct = (n) => `${(n || 0).toFixed(2)}%`;

export default function App() {
  const [monthlyGross, setMonthlyGross] = useState(35000);
  const [municipality, setMunicipality] = useState("Kommun");
  const [kommunalskattPct, setKommunalskattPct] = useState(31.5);
  const [kyrkan, setKyrkan] = useState(false);
  const [kyrkoPct, setKyrkoPct] = useState(1.0);

  const nowRef = useRef(new Date());
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { nowRef.current = toZonedDate(); force(x=>x+1); }, 100);
    return () => clearInterval(id);
  }, []);

  const {
    yearlyGross, yearlyNet, sekPerSecGross, sekPerSecNet,
    todayAccGross, todayAccNet, isWithinWorkHours
  } = useMemo(() => {
    const now = nowRef.current;
    const year = now.getFullYear();
    const workSecondsYear = countWorkingDaysInYear(year) * 8 * 3600;

    const yearlyGross = monthlyGross * 12;
    const totalTaxPct = (kommunalskattPct || 0) + (kyrkan ? (kyrkoPct || 0) : 0);
    const taxFactor = Math.max(0, 1 - totalTaxPct / 100);
    const yearlyNet = yearlyGross * taxFactor;

    const sekPerSecGross = yearlyGross / workSecondsYear;
    const sekPerSecNet = yearlyNet / workSecondsYear;

    const { start, end } = workdayWindow(now);
    const within = isWorkday(now) && now >= start && now <= end;
    const secondsToday = secondsWorkedSoFarToday(now);

    const todayAccGross = within ? sekPerSecGross * secondsToday : (now > end ? sekPerSecGross * 8 * 3600 : 0);
    const todayAccNet = within ? sekPerSecNet * secondsToday : (now > end ? sekPerSecNet * 8 * 3600 : 0);

    return { yearlyGross, yearlyNet, sekPerSecGross, sekPerSecNet, todayAccGross, todayAccNet, isWithinWorkHours: within };
  }, [monthlyGross, kommunalskattPct, kyrkoPct, kyrkan]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col items-center p-4">
      <div className="w-full max-w-md">
        <header className="mt-2 mb-4">
          <h1 className="text-2xl font-bold">💸 Svensk Lönesnurra</h1>
          <p className="text-slate-600 text-sm">Beräknar intjänande per sekund före/efter skatt (vardagar 09–17). Pausar övrig tid.</p>
        </header>

        <section className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium">Månadslön (brutto)</label>
            <input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={monthlyGross} min={0}
                   onChange={(e) => setMonthlyGross(Number(e.target.value))}/>
          </div>

          <div>
            <label className="block text-sm font-medium">Stad/kommun (valfritt)</label>
            <input type="text" className="mt-1 w-full rounded-xl border px-3 py-2" placeholder="t.ex. Stockholm"
                   value={municipality} onChange={(e) => setMunicipality(e.target.value)}/>
            <p className="text-xs text-slate-500 mt-1">Fyll i din kommunalskatt och ev. kyrkoavgift nedan.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">Kommunalskatt (%)</label>
              <input type="number" step="0.01" className="mt-1 w-full rounded-xl border px-3 py-2"
                     value={kommunalskattPct} min={0}
                     onChange={(e) => setKommunalskattPct(Number(e.target.value))}/>
            </div>

            <div>
              <label className="block text-sm font-medium">Medlem i Svenska kyrkan?</label>
              <div className="mt-2 flex items-center gap-2">
                <input id="kyrkan" type="checkbox" checked={kyrkan} onChange={(e) => setKyrkan(e.target.checked)}/>
                <label htmlFor="kyrkan" className="text-sm">Ja</label>
              </div>
            </div>
          </div>

          {kyrkan && (
            <div>
              <label className="block text-sm font-medium">Kyrkoavgift (%)</label>
              <input type="number" step="0.01" className="mt-1 w-full rounded-xl border px-3 py-2"
                     value={kyrkoPct} min={0}
                     onChange={(e) => setKyrkoPct(Number(e.target.value))}/>
            </div>
          )}
        </section>

        <section className="mt-4 grid gap-3">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">Per sekund</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-xl bg-slate-50">
                <div className="text-slate-500">Före skatt</div>
                <div className="text-lg font-mono">{fmtSEK(sekPerSecGross)}</div>
              </div>
              <div className="p-3 rounded-xl bg-green-50">
                <div className="text-slate-500">Efter skatt (förenklat)</div>
                <div className="text-lg font-mono">{fmtSEK(sekPerSecNet)}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Beräknat på {countWorkingDaysInYear(new Date().getFullYear())} arbetsdagar × 8 timmar.</p>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">Dagens snurra {isWithinWorkHours ? "⏱️" : "⏸️"}</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-xl bg-slate-50">
                <div className="text-slate-500">Ack. före skatt</div>
                <div className="text-2xl font-mono">{fmtSEK(todayAccGross)}</div>
              </div>
              <div className="p-3 rounded-xl bg-green-50">
                <div className="text-slate-500">Ack. efter skatt</div>
                <div className="text-2xl font-mono">{fmtSEK(todayAccNet)}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Snurran går endast under arbetstid (09–17) på arbetsdagar.</p>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">Årsvy (förenklad)</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-xl bg-slate-50">
                <div className="text-slate-500">Årslön brutto</div>
                <div className="text-lg font-mono">{fmtSEK(yearlyGross)}</div>
              </div>
              <div className="p-3 rounded-xl bg-green-50">
                <div className="text-slate-500">Årslön netto</div>
                <div className="text-lg font-mono">{fmtSEK(yearlyNet)}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Netto beräknas med {fmtPct(kommunalskattPct)} kommunalskatt{kyrkan ? ` + ${fmtPct(kyrkoPct)} kyrkoavgift` : ""}.</p>
          </div>
        </section>

        <footer className="text-xs text-slate-500 mt-6 mb-8">
          <p>Obs! Förenklad modell utan grund-/jobbskatteavdrag, begravningsavgift eller statlig inkomstskatt.</p>
        </footer>
      </div>
    </div>
  );
}
