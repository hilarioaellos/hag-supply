"use client";

import { FormEvent, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export type ShippingValues = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
};

type Props = {
  states: { code: string; name: string }[];
  defaultName: string;
  initialValues?: ShippingValues | null;
  submitting: boolean;
  error: string | null;
  fieldErrors: Partial<Record<keyof ShippingValues, string>>;
  onSubmit: (values: ShippingValues) => void;
};

export function ShippingForm({ states, defaultName, initialValues, submitting, error, fieldErrors, onSubmit }: Props) {
  const [values, setValues] = useState<ShippingValues>(initialValues ?? {
    name: defaultName,
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
  });

  const set = (key: keyof ShippingValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white border border-hag-border rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-[18px] font-bold text-hag-text">Shipping address</h2>
        <p className="text-[13px] text-hag-text-2 mt-1">We currently ship within the United States only.</p>
      </div>

      <Input className="w-full" id="ship-name" label="Full name" autoComplete="name" required value={values.name} onChange={set("name")} error={fieldErrors.name} />
      <Input className="w-full" id="ship-line1" label="Address" autoComplete="address-line1" required value={values.line1} onChange={set("line1")} error={fieldErrors.line1} />
      <Input
        className="w-full"
        id="ship-line2"
        label="Apartment, suite, etc. (optional)"
        autoComplete="address-line2"
        value={values.line2}
        onChange={set("line2")}
        error={fieldErrors.line2}
      />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px] gap-4 [&>*]:min-w-0">
        <Input className="w-full" id="ship-city" label="City" autoComplete="address-level2" required value={values.city} onChange={set("city")} error={fieldErrors.city} />

        <div className="flex flex-col gap-1">
          <label htmlFor="ship-state" className="text-sm font-500 text-hag-text">State</label>
          <select
            id="ship-state"
            autoComplete="address-level1"
            required
            value={values.state}
            onChange={set("state")}
            className={`w-full h-10 rounded-lg border px-3 text-sm outline-none bg-hag-bg text-hag-text ${
              fieldErrors.state
                ? "border-hag-sale focus:ring-1 focus:ring-hag-sale"
                : "border-hag-border focus:border-hag-accent focus:ring-1 focus:ring-hag-accent"
            }`}
          >
            <option value="">Select…</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
          {fieldErrors.state && <p className="text-xs text-hag-sale">{fieldErrors.state}</p>}
        </div>

        <Input
          className="w-full"
          id="ship-zip"
          label="ZIP code"
          autoComplete="postal-code"
          inputMode="numeric"
          required
          value={values.zip}
          onChange={set("zip")}
          error={fieldErrors.zip}
        />
      </div>

      {error && (
        <p role="alert" className="text-[14px] text-hag-sale">{error}</p>
      )}

      <Button type="submit" size="lg" loading={submitting} disabled={submitting} className="w-full sm:w-auto sm:self-end">
        Continue to payment
      </Button>
    </form>
  );
}
