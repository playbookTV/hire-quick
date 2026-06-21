/**
 * Create Event — a 3-step wizard (Basics → Staffing → Review) that submits to
 * POST /api/events. Validation is the SAME `createEventSchema` the server runs
 * (via zodResolver), so the client can't construct a request the server rejects.
 * Money is collected in naira and stored as kobo.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createEventSchema,
  type CreateEventInput,
  kobo,
  formatNaira,
  ACCOMMODATION_STATUSES,
} from '@hq/shared';

import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { TextArea } from '../../components/TextArea.js';
import { Select, type SelectOption } from '../../components/Select.js';
import { Stepper } from '../../components/Stepper.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { Card } from '../../components/Card.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { Box, Text } from '../../theme/restyle.js';
import { useCreateEvent } from '../../lib/hooks.js';
import { ApiError } from '../../lib/api-error.js';
import { formatEventDate, formatTimeRange } from '../../lib/format.js';

const CATEGORIES = [
  'Wedding',
  'Corporate event',
  'Concert',
  'Conference',
  'Party',
  'Product launch',
  'Religious event',
  'Other',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type FieldName = keyof CreateEventInput;
const STEP_FIELDS: FieldName[][] = [
  ['title', 'venue', 'category', 'eventDate', 'startTime', 'endTime'],
  ['headcount', 'budgetPerHeadKobo', 'dressCode', 'accommodation', 'requirements'],
  [],
];

export default function CreateEvent(): React.JSX.Element {
  const router = useRouter();
  const createEvent = useCreateEvent();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dateOptions = useMemo<SelectOption<string>[]>(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 60 }).map((_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i + 1);
      return { value: dateKey(d), label: formatEventDate(d.toISOString()) };
    });
  }, []);

  const timeOptions = useMemo<SelectOption<string>[]>(() => {
    const out: SelectOption<string>[] = [];
    for (let h = 6; h <= 23; h++) {
      for (const m of [0, 30]) {
        const v = `${pad(h)}:${pad(m)}`;
        out.push({ value: v, label: v });
      }
    }
    return out;
  }, []);

  const {
    control,
    handleSubmit,
    trigger,
    watch,
    setError,
    formState: { errors },
  } = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    mode: 'onTouched',
    defaultValues: {
      title: '',
      venue: '',
      category: '',
      eventDate: tomorrow,
      startTime: '10:00',
      endTime: '14:00',
      headcount: 1,
      budgetPerHeadKobo: 0,
      dressCode: '',
      accommodation: undefined,
      requirements: '',
    },
  });

  const values = watch();
  const total = kobo((values.headcount || 0) * (values.budgetPerHeadKobo || 0));
  const lateNight = (values.endTime ?? '') >= '22:00';

  const next = async () => {
    setFormError(null);
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((s) => Math.min(2, s + 1));
  };

  const onSubmit = async (data: CreateEventInput) => {
    setFormError(null);
    try {
      await createEvent.mutateAsync(data);
      router.back(); // modal closes; events list refetches via invalidation
    } catch (e) {
      if (e instanceof ApiError && e.isValidation && e.issues) {
        for (const issue of e.issues) {
          const key = issue.path[0];
          if (typeof key === 'string') setError(key as FieldName, { message: issue.message });
        }
        setStep(0);
      }
      setFormError(e instanceof ApiError ? e.message : 'Could not create the event. Try again.');
    }
  };

  const onBack = () => (step === 0 ? router.back() : setStep((s) => s - 1));

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar
        title="Create event"
        showBack
        onBack={onBack}
        inset
        right={
          <Text variant="labelSm" color="inkMuted">
            {step + 1}/3
          </Text>
        }
      />
      <Box paddingHorizontal="500" paddingBottom="300">
        <StepIndicator total={3} current={step} />
      </Box>

      <Screen scroll>
        {formError ? (
          <Box marginBottom="400">
            <Banner tone="warning" message={formError} />
          </Box>
        ) : null}

        {step === 0 ? (
          <>
            <Controller
              control={control}
              name="title"
              render={({ field }) => (
                <Field label="Event title" error={errors.title?.message} required>
                  <Input
                    placeholder="e.g. Adaeze & Tomi Wedding"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={!!errors.title}
                    maxLength={120}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="venue"
              render={({ field }) => (
                <Field label="Venue" error={errors.venue?.message} required>
                  <Input
                    leftIcon="map-pin"
                    placeholder="e.g. Eko Hotel, Victoria Island"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={!!errors.venue}
                    maxLength={200}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Field label="Category" error={errors.category?.message} required>
                  <Select
                    title="Event category"
                    placeholder="Choose a category"
                    value={field.value || null}
                    options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                    onSelect={field.onChange}
                    error={!!errors.category}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="eventDate"
              render={({ field }) => (
                <Field label="Date" error={errors.eventDate?.message} required>
                  <Select
                    title="Event date"
                    value={field.value ? dateKey(new Date(field.value)) : null}
                    options={dateOptions}
                    onSelect={(v) => field.onChange(new Date(`${v}T00:00:00`))}
                    error={!!errors.eventDate}
                  />
                </Field>
              )}
            />
            <Box flexDirection="row" gap="300">
              <Box flex={1}>
                <Controller
                  control={control}
                  name="startTime"
                  render={({ field }) => (
                    <Field label="Start" error={errors.startTime?.message} required>
                      <Select value={field.value} options={timeOptions} onSelect={field.onChange} title="Start time" />
                    </Field>
                  )}
                />
              </Box>
              <Box flex={1}>
                <Controller
                  control={control}
                  name="endTime"
                  render={({ field }) => (
                    <Field label="End" error={errors.endTime?.message} required>
                      <Select value={field.value} options={timeOptions} onSelect={field.onChange} title="End time" />
                    </Field>
                  )}
                />
              </Box>
            </Box>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Controller
              control={control}
              name="headcount"
              render={({ field }) => (
                <Field label="How many staff?" error={errors.headcount?.message} required>
                  <Stepper value={field.value} onChange={field.onChange} min={1} max={100} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="budgetPerHeadKobo"
              render={({ field }) => (
                <Field
                  label="Budget per head (₦)"
                  helper="What each staff member earns for this event."
                  error={errors.budgetPerHeadKobo?.message}
                  required
                >
                  <Input
                    leftIcon="dollar-sign"
                    placeholder="e.g. 15000"
                    keyboardType="number-pad"
                    value={field.value ? String(Math.round(field.value / 100)) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/\D/g, ''), 10);
                      field.onChange(Number.isFinite(n) ? n * 100 : 0);
                    }}
                    error={!!errors.budgetPerHeadKobo}
                    maxLength={9}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="dressCode"
              render={({ field }) => (
                <Field label="Dress code" helper="Optional" error={errors.dressCode?.message}>
                  <Input
                    placeholder="e.g. Black tie, all-white"
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    maxLength={200}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="accommodation"
              render={({ field }) => (
                <Field
                  label="Accommodation"
                  helper={lateNight ? 'Required for events ending at or after 10:00 PM' : 'Optional'}
                  error={errors.accommodation?.message}
                  required={lateNight}
                >
                  <Select
                    title="Accommodation"
                    placeholder="Select"
                    value={field.value ?? null}
                    options={ACCOMMODATION_STATUSES.map((s) => ({
                      value: s,
                      label: s === 'PROVIDED' ? 'Provided' : 'Not provided',
                    }))}
                    onSelect={field.onChange}
                    error={!!errors.accommodation}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="requirements"
              render={({ field }) => (
                <Field label="Extra requirements" helper="Optional" error={errors.requirements?.message}>
                  <TextArea
                    placeholder="Anything staff should know — duties, arrival time, contact…"
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    maxLength={2000}
                  />
                </Field>
              )}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text variant="h2" marginBottom="300">
              Review
            </Text>
            <Card>
              <KeyValueRow label="Title" value={values.title || '—'} />
              <KeyValueRow label="Venue" value={values.venue || '—'} />
              <KeyValueRow label="Category" value={values.category || '—'} />
              <KeyValueRow
                label="Date"
                value={values.eventDate ? formatEventDate(new Date(values.eventDate).toISOString()) : '—'}
              />
              <KeyValueRow label="Time" value={formatTimeRange(values.startTime, values.endTime)} />
            </Card>
            <Box height={12} />
            <Card>
              <KeyValueRow label="Staff needed" value={String(values.headcount)} />
              <KeyValueRow label="Budget / head" value={formatNaira(kobo(values.budgetPerHeadKobo || 0))} />
              {values.dressCode ? <KeyValueRow label="Dress code" value={values.dressCode} /> : null}
              {values.accommodation ? (
                <KeyValueRow
                  label="Accommodation"
                  value={values.accommodation === 'PROVIDED' ? 'Provided' : 'Not provided'}
                />
              ) : null}
              <Box height={1} backgroundColor="borderDefault" marginVertical="200" />
              <KeyValueRow label="Total to escrow" value={formatNaira(total)} tone="brand" emphasize />
            </Card>
            <Box height={16} />
            <Banner
              tone="brand"
              message="Your event will be posted as Open. You’ll confirm staff and pay into escrow once ushers apply."
            />
          </>
        ) : null}

        <Box flex={1} minHeight={24} />
        {step < 2 ? (
          <Button label="Continue" onPress={next} />
        ) : (
          <Button label="Create event" loading={createEvent.isPending} onPress={handleSubmit(onSubmit)} />
        )}
      </Screen>
    </Box>
  );
}
