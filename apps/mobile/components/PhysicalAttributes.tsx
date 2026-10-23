import { useState } from 'react';
import type { PhysicalAttributes, PresentationPreferences } from '@hq/shared';
import { Box, Text } from '../theme/restyle.js';
import { Field } from './Field.js';
import { Input } from './Input.js';
import { Select } from './Select.js';
import { TextArea } from './TextArea.js';
import { Button } from './Button.js';
import { KeyValueRow } from './KeyValueRow.js';

const FIELDS = [
  ['age', 'Age (years)', true],
  ['heightCm', 'Height (cm)', true],
  ['shoeSizeUk', 'Shoe size (UK)', true],
  ['bodyType', 'Body type', false],
  ['dressSize', 'Dress / clothing size', false],
  ['skinTone', 'Skin tone', false],
  ['hairstyle', 'Hairstyle', false],
] as const;

function NumericAttributeInput({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: number | undefined;
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

export function PhysicalAttributesForm({
  value,
  onChange,
}: {
  value: PhysicalAttributes;
  onChange: (value: PhysicalAttributes) => void;
}): React.JSX.Element {
  const set = (key: keyof PhysicalAttributes, text: string, numeric = false): void => {
    const next = { ...value };
    if (!text.trim()) delete next[key];
    else Object.assign(next, { [key]: numeric ? Number(text) : text });
    onChange(next);
  };
  return (
    <Box gap="300">
      <Field label="Gender (optional)">
        <Select
          value={value.gender ?? ''}
          options={['', 'Male', 'Female', 'Non-binary', 'Self-described'].map((v) => ({
            value: v,
            label: v || 'Prefer not to say',
          }))}
          onSelect={(v) => set('gender', v)}
        />
      </Field>
      {FIELDS.map(([key, label, numeric]) => (
        <Field key={key} label={`${label} (optional)`}>
          {numeric ? (
            <NumericAttributeInput value={value[key]} onChange={(v) => set(key, v, true)} />
          ) : (
            <Input
              value={value[key] ?? ''}
              onChangeText={(v) => set(key, v)}
              maxLength={key === 'dressSize' ? 30 : 60}
            />
          )}
        </Field>
      ))}
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
          <KeyValueRow key={key} label={label} value={String(value[key])} />
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
