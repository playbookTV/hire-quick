import { useState } from 'react';
import type { PhysicalAttributes, PresentationPreferences } from '@hq/shared';
import { Box, Text } from '../theme/restyle.js';
import { Field } from './Field.js';
import { Input } from './Input.js';
import { Select } from './Select.js';
import { TextArea } from './TextArea.js';
import { Button } from './Button.js';
import { KeyValueRow } from './KeyValueRow.js';
import {
  ATTRIBUTE_CHOICES,
  attributeLabel,
  attributeOptions,
  type AttributeKey,
} from '../lib/attribute-options.js';

const FIELDS: readonly (readonly [AttributeKey, string])[] = [
  ['age', 'Age (years)'],
  ['heightCm', 'Height (cm)'],
  ['shoeSizeEu', 'Shoe size (EU)'],
  // Earlier profiles stored UK sizes; the form shows this only while one is saved.
  ['shoeSizeUk', 'Shoe size (UK)'],
  ['bodyType', 'Body type'],
  ['dressSize', 'Dress / clothing size'],
  ['skinTone', 'Skin tone'],
  ['hairstyle', 'Hairstyle'],
];
const NUMERIC: ReadonlySet<keyof PhysicalAttributes> = new Set([
  'age',
  'heightCm',
  'shoeSizeEu',
  'shoeSizeUk',
]);

function NumericAttributeInput({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: string | number | undefined;
  onChange: (text: string) => void;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      value={text}
      onChangeText={(next) => {
        if (/^\d*\.?\d*$/.test(next)) {
          setText(next);
          onChange(next);
        }
      }}
      keyboardType="decimal-pad"
      maxLength={5}
    />
  );
}

/** `emptyLabel` names the "not set" choice: "Prefer not to say" on a profile, "No preference" on an event. */
export function PhysicalAttributesForm({
  value,
  onChange,
  emptyLabel = 'Prefer not to say',
}: {
  value: PhysicalAttributes;
  onChange: (value: PhysicalAttributes) => void;
  emptyLabel?: string;
}): React.JSX.Element {
  const set = (key: keyof PhysicalAttributes, text: string): void => {
    const next = { ...value };
    if (!text.trim()) delete next[key];
    else Object.assign(next, { [key]: NUMERIC.has(key) ? Number(text) : text });
    onChange(next);
  };
  return (
    <Box gap="300">
      <Field label="Gender (optional)">
        <Select
          title="Gender"
          value={value.gender ?? ''}
          options={['', 'Male', 'Female', 'Non-binary', 'Self-described'].map((v) => ({
            value: v,
            label: v || emptyLabel,
          }))}
          onSelect={(v) => set('gender', v)}
        />
      </Field>
      {FIELDS.filter(([key]) => key !== 'shoeSizeUk' || value.shoeSizeUk !== undefined).map(
        ([key, label]) => (
          <Field key={key} label={`${label} (optional)`}>
            {ATTRIBUTE_CHOICES[key] ? (
              <Select
                title={label}
                value={value[key] === undefined ? '' : String(value[key])}
                options={attributeOptions(key, value[key], emptyLabel)}
                onSelect={(v) => set(key, v)}
              />
            ) : (
              <NumericAttributeInput
                accessibilityLabel={label}
                value={value[key]}
                onChange={(v) => set(key, v)}
              />
            )}
          </Field>
        ),
      )}
    </Box>
  );
}

export function PhysicalAttributesSummary({
  value,
  title = 'Physical attributes',
}: {
  value?: PhysicalAttributes | null;
  title?: string;
}): React.JSX.Element | null {
  if (!value || !Object.keys(value).length) return null;
  return (
    <Box gap="200">
      <Text variant="headingS">{title}</Text>
      {value.gender ? <KeyValueRow label="Gender" value={value.gender} /> : null}
      {FIELDS.map(([key, label]) =>
        value[key] === undefined ? null : (
          <KeyValueRow key={key} label={label} value={attributeLabel(key, value[key])} />
        ),
      )}
    </Box>
  );
}

export function PresentationPreferencesForm({
  value,
  onChange,
  error,
}: {
  value?: PresentationPreferences | null;
  onChange: (value: PresentationPreferences | null) => void;
  error?: string;
}): React.JSX.Element {
  return (
    <Box gap="300" marginBottom="400">
      <Text variant="headingS">Physical preferences</Text>
      <Text variant="bodySm" color="inkMuted">
        Optional. Explain the job-related reason for any preference. These details do not
        automatically exclude applicants.
      </Text>
      {value ? (
        <>
          <PhysicalAttributesForm
            value={value.attributes}
            onChange={(attributes) => onChange({ ...value, attributes })}
            emptyLabel="No preference"
          />
          <Field label="Why is this needed for the job?" required error={error}>
            <TextArea
              value={value.rationale}
              onChangeText={(rationale) => onChange({ ...value, rationale })}
              maxLength={500}
              placeholder="Explain the requirement (at least 10 characters)"
            />
          </Field>
          <Button
            label="Remove physical preferences"
            variant="ghost"
            onPress={() => onChange(null)}
          />
        </>
      ) : (
        <Button
          label="Add physical preferences"
          variant="secondary"
          onPress={() => onChange({ attributes: {}, rationale: '' })}
        />
      )}
    </Box>
  );
}
