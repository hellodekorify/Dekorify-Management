"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/currency";

/**
 * Amount plus optional currency. When a foreign currency is chosen an exchange
 * rate field appears, because the server stores both the original amount and
 * its converted value in the store's base currency.
 */
export function MoneyInput({
  name = "amount",
  label = "Amount",
  baseCurrency,
  defaultAmount,
  defaultCurrency,
  defaultFxRate,
  error,
  fxError,
  required = true,
  hint,
  allowCurrencyChange = true,
}: {
  name?: string;
  label?: string;
  baseCurrency: string;
  defaultAmount?: string;
  defaultCurrency?: string;
  defaultFxRate?: string;
  error?: string;
  fxError?: string;
  required?: boolean;
  hint?: string;
  allowCurrencyChange?: boolean;
}) {
  const [currency, setCurrency] = useState(defaultCurrency ?? baseCurrency);
  const isForeign = currency !== baseCurrency;

  return (
    <div className="space-y-3">
      <Field label={label} error={error} hint={hint} required={required}>
        <div className="flex gap-2">
          <Input
            name={name}
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={defaultAmount}
            required={required}
            className="flex-1"
            aria-label={label}
          />
          {allowCurrencyChange ? (
            <Select
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="w-28 shrink-0"
              aria-label="Currency"
              options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
            />
          ) : (
            <>
              <input type="hidden" name="currency" value={currency} />
              <span className="flex h-9.5 w-28 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-muted text-sm font-medium text-muted-strong">
                {currency}
              </span>
            </>
          )}
        </div>
      </Field>

      {isForeign && (
        <Input
          name="fxRate"
          label={`Exchange rate to ${baseCurrency}`}
          inputMode="decimal"
          placeholder={`How many ${baseCurrency} is 1 ${currency}?`}
          defaultValue={defaultFxRate}
          required
          error={fxError}
          hint={`The ${CURRENCIES[currency as keyof typeof CURRENCIES]?.name ?? currency} amount is converted at this rate and reported in ${baseCurrency}.`}
        />
      )}
    </div>
  );
}
