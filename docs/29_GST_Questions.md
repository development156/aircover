# 29 · GST — the questions a Chartered Accountant has to answer

**Status:** open. Invoicing is BUILT and TURNED OFF. It stays off until this document comes
back answered.

Take this to an accountant as it stands. Every section states the question in plain language,
then names what the code assumes today and what happens if that assumption is wrong. There
are **eleven** questions; the first five change money on every invoice, and the last six
change the paperwork.

---

## How to read this

`loadGstSupplierConfig` (`packages/billing/src/invoices/gstEnv.ts`) has **no defaults for any
field.** Not one. If a value is missing, invoicing reports itself unavailable and the app says
so plainly — it does not guess, and it does not fall back to an example.

That is deliberate. A GSTIN, a legal name, a SAC code and a rate are statements about a real
registered business printed on a document that claims to be a tax invoice. A placeholder that
survived into production would be a fabricated statutory record.

So the table below is not "settings we should probably check". Until it is filled in, **the
product takes payments and tells the customer their invoice is not available yet.** That is the
current, intended behaviour.

| Env var | Question | Code today |
|---|---|---|
| `SAHODA_GST_LEGAL_NAME` | Registered legal name | not set |
| `SAHODA_GST_GSTIN` | The GSTIN | not set |
| `SAHODA_GST_STATE_CODE` | Supplier state | derived from the GSTIN |
| `SAHODA_GST_ADDRESS` | Registered address | not set |
| `SAHODA_GST_SAC_CODE` | **Q3** | not set |
| `SAHODA_GST_RATE_PERCENT` | **Q1** | not set |
| `SAHODA_GST_PRICE_INCLUDES_TAX` | **Q2** | not set |
| `SAHODA_GST_EXPORT_UNDER_LUT` | **Q5** | not set |
| `SAHODA_GST_SERIAL_PREFIX` | **Q7** | not set |
| `SAHODA_GST_CREDIT_NOTE_PREFIX` | **Q7** | not set |

MEASURED 2026-08-20: **0 of 10 are configured.**

---

# Part one — the five that change the money

## Q1. What rate applies to a SaaS subscription sold from India?

**Ask:** Sahoda Labs sells a monthly software subscription — an online marketing tool. What GST
rate applies? Is it 18%, and is there any part of what we sell that is rated differently?

**What the code assumes today:** nothing. `SAHODA_GST_RATE_PERCENT` is required, must be a whole
number 0–100, and there is no fallback. The whole tax calculation
(`packages/billing/src/tax/computeTax.ts`) is driven from this single number.

**If it is wrong:** every invoice is wrong by the difference, in both directions — we either
under-collect and owe the shortfall ourselves, or over-collect from customers.

**One thing to raise:** the rate is a single whole number. If different parts of the plan
(software vs. any service element) attract different rates, the code as built **cannot express
that** and would need changing before launch. Please say so explicitly if it applies.

---

## Q2. Is ₹499 what the customer pays, or ₹499 plus GST?

**Ask:** Our published prices are ₹499, ₹1,499 and ₹3,999 a month. Should these be treated as
**tax-inclusive** (the customer's card is charged exactly ₹499 and GST is backed out of it) or
**tax-exclusive** (the customer is charged ₹499 + ₹89.82 = ₹588.82)?

**What the code assumes today:** nothing. `SAHODA_GST_PRICE_INCLUDES_TAX` is required and is
parsed **strictly** — only `true`, `false`, `1` or `0` are accepted, because `Boolean('false')`
is `true` in JavaScript and that single bug would move every figure by 18% while looking
perfectly healthy.

**If it is wrong:** every figure on every invoice moves by 18%, and the amount charged to the
card no longer matches the amount on the document.

**Worked example at 18%, so the difference is concrete:**

| | Inclusive | Exclusive |
|---|---|---|
| Card is charged | ₹499.00 | ₹588.82 |
| Taxable value | ₹422.88 | ₹499.00 |
| CGST | ₹38.06 | ₹44.91 |
| SGST | ₹38.06 | ₹44.91 |

**This is also a pricing and marketing decision, not only a tax one** — it decides what the
customer sees on the pricing page. Please confirm which we are legally required to do, and
whether we may choose.

---

## Q3. What is the correct SAC code?

**Ask:** What Service Accounting Code should appear on our invoices? Our best reading is
**998314** (information technology infrastructure and design services), but 998313 and 998439
have both been suggested for SaaS.

**What the code assumes today:** nothing. `SAHODA_GST_SAC_CODE` is required and must be at
least 4 characters. It is printed on the invoice and stored on the row.

**If it is wrong:** the invoice carries a wrong classification. It is a paperwork error rather
than a money error, but it is on a filed document.

---

## Q4. How do we treat an Indian customer who has no GSTIN?

**Ask:** Most of our customers are small businesses and solo founders, many unregistered. For an
unregistered Indian customer we collect only their **state**. Is that sufficient, and is the
place of supply their state?

**What the code assumes today:**

- A **registered** customer's state is read **from the GSTIN itself**, never from a separately
  stored field — the two can disagree, and the GSTIN is what the return is filed against.
- An **unregistered** customer supplies a state code directly, and it is the place of supply.
- Same state as ours → CGST + SGST. Different state → IGST.

**If it is wrong:** supplies are split between CGST/SGST and IGST incorrectly, which is a
filing error rather than a total-amount error.

**Related, and please answer directly:** is there a threshold above which we must collect a
GSTIN, or refuse to invoice without one?

---

## Q5. Do we have a LUT, and what happens to overseas customers?

**Ask:** For customers outside India, an export of service is zero-rated. That can happen two
ways: **under a Letter of Undertaking**, where no tax is collected at all, or **on payment of
IGST**, which is charged and reclaimed later. Do we have a LUT? Should we get one?

**What the code assumes today:** nothing. `SAHODA_GST_EXPORT_UNDER_LUT` is required and strictly
parsed. With it `true`, an overseas invoice carries **zero tax** and is marked zero-rated under
LUT. With it `false`, IGST is charged at the full rate and the invoice is marked zero-rated but
not under LUT. Place of supply is recorded as **96** (outside India).

**If it is wrong:** with `true` set and no LUT actually in force, we have **failed to collect
tax we owe** on every export. This is the single most expensive way to get one of these values
wrong, because nothing else in the system will notice.

---

# Part two — the six that change the paperwork

## Q6. Is the financial year boundary correct in UTC?

**Ask:** Invoice numbers must be consecutive **within a financial year** (April 1 – March 31).
Our server reads that boundary in **UTC**. That means an invoice issued in the last five and a
half hours of March 31 IST — after 18:30 IST — is numbered into the **new** financial year.

**What the code assumes today:** `financialYear()`
(`packages/billing/src/invoices/financialYear.ts`) reads the instant in UTC, deliberately, so
that the answer is a property of the instant rather than of which machine ran the code.

**If it is wrong:** a handful of invoices each year land in the wrong series. It is one function
to change, and the note is already written into that file.

**Please answer directly:** must the financial year follow IST?

---

## Q7. Are two separate number series acceptable?

**Ask:** We issue **tax invoices** with one prefix (e.g. `SL/26-27/000001`) and **credit notes**
with a different one (e.g. `SLC/26-27/000001`). Each has its own counter, so both series start
at 1 and neither has a gap. Is that acceptable, or must credit notes continue the invoice
series?

**What the code assumes today:** two genuinely separate counters — the `invoice_serials` table
is keyed on `(financial_year, document_type)`, so they are separate **rows**, not one counter
printing two prefixes. The config refuses to start if the two prefixes are identical, because
that would print two different documents with the same number.

**VERIFIED 2026-08-20, against a real Postgres:** invoice 1, invoice 2, credit note 1 —
counters ended at `tax_invoice → 3`, `credit_note → 2`. Two rows, two series.

**Format note:** GST caps the printed number at **16 characters**. `SL/26-27/000001` is 15. The
prefix length is capped from that limit rather than written down separately.

---

## Q8. Is our gapless numbering actually gapless?

**Ask:** Invoice numbers must have no gaps within a financial year. We do not use a database
sequence, because `nextval` in Postgres is deliberately **non-transactional** — a rolled-back
insert would consume a number and leave a permanent hole that a return would be queried about.
Instead a counter row is locked and incremented **inside the same transaction as the invoice**,
so the two commit or roll back together.

**VERIFIED 2026-08-20, against a real Postgres:** issue invoice 1 → issue invoice 2 inside a
transaction → roll that transaction back → issue again. The next number was **2**, not 3. No
number was burned. A sequence would have burned one.

**Also verified:** a redelivered payment webhook returns the **existing** document rather than
minting a second number, and an issued invoice **cannot be edited or deleted** — a database
trigger refuses `UPDATE` and `DELETE` even to the service role.

**Please confirm** this satisfies the consecutive-numbering requirement.

---

## Q9. Is a chargeback a credit note, and how do we record what we cannot take back?

**Ask:** When a customer's bank reverses a payment, we issue a **credit note** against the
original invoice. But the customer may already have spent the credits that payment bought. We
therefore record two figures on the credit note: the credits we **could** take back, and a
**shortfall** — the credits already consumed, which we treat as **money owed to us**, a
receivable.

**What the code assumes today:** the ledger is append-only, so a reversal is a new compensating
entry, never an edit. It is **clamped to what is available**, and the remainder is recorded as
`shortfall_credits` on the credit note.

**Why it is clamped, MEASURED against the real function:** an unclamped reversal does not
partially apply — it violates a database constraint, the whole transaction aborts, and **the
chargeback is recorded nowhere at all.** The money has left the bank account either way, so an
invisible chargeback is strictly worse than a clamped one.

**VERIFIED 2026-08-20:** granted 1500, spent 1300, chargeback of 1500 → reversed **200**,
shortfall **1300**, balance 0, and the original entries untouched.

**Please answer:**
1. Is a credit note the right instrument for a chargeback, or is it something else?
2. Should the shortfall appear **on** the credit note, or be carried separately as a receivable?
3. Does the credit note carry the same tax treatment as the invoice it reverses?

---

## Q10. Should a downgrade or a refund ever produce a credit note?

**Ask:** A **downgrade never takes effect mid-period** — it lands on the period boundary the
customer has already paid for, so no money moves and nothing is refunded. An **upgrade** is
immediate and charges a prorated difference. Does either produce a document beyond the ordinary
invoice for the amount actually charged?

**What the code assumes today:** only a payment produces a tax invoice, and only a refund or
chargeback produces a credit note. A downgrade produces no document at all, because no money
moves.

**On the proration, since it appears on an invoice** — every rounding goes to the **customer**,
by design: the charge for the remaining part of the period is rounded **down**, the unused value
set against it is rounded **up**, and the credits granted are rounded **up**.

**MEASURED 2026-08-20** (Starter → Growth, mid-period, 5031 basis points remaining):

| | Exact | Charged / granted | Direction |
|---|---|---|---|
| Remainder charge | 75414.69 p | **75414 p** | down — customer's way |
| Unused set-off | 25104.69 p | **25105 p** | up — customer's way |
| Credits granted | 1760.85 | **1761** | up — customer's way |
| **Amount due** | | **₹503.09** | |

**Please confirm** that rounding consistently in the customer's favour raises no issue, and that
a prorated charge is invoiced as an ordinary supply.

---

## Q11. When must the invoice be issued, and does the customer have to receive it?

**Ask:** We issue the invoice when the payment webhook confirms the money arrived. Is there a
required time limit for issuing a tax invoice for a service? Must we **deliver** it to the
customer, or is making it available in-app enough? Do we need to retain signed copies, and for
how long?

**What the code assumes today:** the invoice row is created in the same flow that credits the
customer's account, and is readable in-app. There is no email delivery step and no retention
policy beyond the database row, which is append-only and cannot be edited or deleted.

---

# What we are NOT asking you to decide

These are already settled in the code and are stated here only so the picture is complete.

- **The ledger is append-only.** Corrections are compensating entries; nothing is ever edited or
  deleted. This holds for invoices too, enforced by a database trigger.
- **Credits already granted are never clawed back** — not at any dunning stage, not on a
  downgrade, not on suspension. A suspended workspace keeps every credit it holds and drops to
  the Free plan's limits, which is the floor.
- **Nothing is ever deleted because a plan changed.** A customer who drops to a smaller plan
  keeps every channel and site they built; the limit binds new creates only.
- **All money is integer paise.** No figure on a statutory document is ever a floating-point
  number.
- **CGST and SGST are equal by construction** — the half is computed first, at half the rate, so
  the two heads cannot differ by a paisa.

---

# What the founder does after this comes back

1. Set the ten `SAHODA_GST_*` variables. Invoicing turns itself on the moment they are all
   present and valid — there is no deploy and no code change.
2. If Q1 reveals more than one rate, or Q6 requires IST, **those need code changes** — flag them
   rather than setting a value.
3. Re-run the verification: `node packages/db/scripts/pgbox.mjs up`, then the billing suite.

**Blocking, and separate from tax:** the Cashfree credentials in the repository are **production
keys** (`cfsk_ma_prod_…`), and they authenticate against neither the sandbox nor the production
host. No real order can be opened until working sandbox keys are in place. See the P1 note in
the lane report.
