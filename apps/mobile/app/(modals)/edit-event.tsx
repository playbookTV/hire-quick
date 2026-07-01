/**
 * Edit Event — single-page edit of an unstarted event (client only). Reuses the
 * create-event field components, prefilled from `useEvent`, validated with the
 * shared `updateEventSchema` (client == server) and saved via `useUpdateEvent`
 * (PATCH /api/events/:id). The backend locks events once a booking is confirmed;
 * we mirror that here so a locked event shows a notice instead of the form.
 */
import { useMemo, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateEventSchema, type UpdateEventInput, kobo, formatNaira, ACCOMMODATION_STATUSES, isLateNight } from '@hq/shared';

import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { TextArea } from '../../components/TextArea.js';
import { Select, type SelectOption } from '../../components/Select.js';
import { Stepper } from '../../components/Stepper.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { Loading } from '../../components/Loading.js';
import { Box, Text } from '../../theme/restyle.js';
import { useEvent, useUpdateEvent } from '../../lib/hooks.js';
import { ApiError } from '../../lib/api-error.js';
import { formatEventDate } from '../../lib/format.js';
import { EVENT_CATEGORIES, HAIRSTYLE_OPTIONS, TIME_OPTIONS, STATE_OPTIONS } from '../../lib/event-options.js';
import type { EventResource } from '../../lib/types.js';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function EditEventForm({ event }: { event: EventResource }): React.JSX.Element {
  const router = useRouter();
  const update = useUpdateEvent(event.id);
  const [formError, setFormError] = useState<string | null>(null);

  const dateOptions = useMemo<SelectOption<string>[]>(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const opts = Array.from({ length: 60 }).map((_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i + 1);
      return { value: dateKey(d), label: formatEventDate(d.toISOString()) };
    });
    // Make sure the event's existing date is always selectable.
    const current = dateKey(new Date(event.eventDate));
    if (!opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label: formatEventDate(event.eventDate) });
    }
    return opts;
  }, [event.eventDate]);


  const {
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<UpdateEventInput>({
    resolver: zodResolver(updateEventSchema),
    mode: 'onTouched',
    defaultValues: {
      title: event.title,
      venue: event.venue,
      state: event.state ?? '',
      category: event.category,
      eventDate: new Date(event.eventDate),
      startTime: event.startTime,
      endTime: event.endTime,
      headcount: event.headcount,
      budgetPerHeadKobo: event.budgetPerHead,
      dressCode: event.dressCode ?? '',
      hairstyle: event.preferences?.hairstyle ?? '',
      accommodation: event.accommodation ?? undefined,
      requirements: event.preferences?.requirements ?? '',
    },
  });

  const values = watch();
  const total = kobo((values.headcount || 0) * (values.budgetPerHeadKobo || 0));
  const lateNight = isLateNight(values.endTime ?? '');
  const endTimeOptions = useMemo(
    () => TIME_OPTIONS.filter((o) => o.value > (values.startTime ?? '')),
    [values.startTime],
  );

  const onSubmit = async (data: UpdateEventInput): Promise<void> => {
    setFormError(null);
    try {
      await update.mutateAsync(data);
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.isValidation && e.issues) {
        for (const issue of e.issues) {
          const key = issue.path[0];
          if (typeof key === 'string') setError(key as keyof UpdateEventInput, { message: issue.message });
        }
      }
      setFormError(e instanceof ApiError ? e.message : 'Could not save your changes. Try again.');
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Edit event" showBack inset />
      <Screen scroll>
        {formError ? (
          <Box marginBottom="400">
            <Banner tone="warning" message={formError} />
          </Box>
        ) : null}

        <Controller
          control={control}
          name="title"
          render={({ field }) => (
            <Field label="Event title" error={errors.title?.message} required>
              <Input placeholder="e.g. Adaeze & Tomi Wedding" value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur} error={!!errors.title} maxLength={120} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="venue"
          render={({ field }) => (
            <Field label="Venue" error={errors.venue?.message} required>
              <Input leftIcon="map-pin" placeholder="e.g. Eko Hotel, Victoria Island" value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur} error={!!errors.venue} maxLength={200} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="state"
          render={({ field }) => (
            <Field label="State" helper="Only ushers in this state will see the job." error={errors.state?.message}>
              <Select title="State" placeholder="Choose state" value={field.value || null} options={STATE_OPTIONS} onSelect={field.onChange} />
            </Field>
          )}
        />
        <Box flexDirection="row" style={{ gap: 16 }}>
          <Box flex={1}>
            <Controller
              control={control}
              name="eventDate"
              render={({ field }) => (
                <Field label="Date" error={errors.eventDate?.message} required>
                  <Select title="Event date" value={field.value ? dateKey(new Date(field.value)) : null} options={dateOptions} onSelect={(v) => field.onChange(new Date(`${v}T00:00:00`))} error={!!errors.eventDate} />
                </Field>
              )}
            />
          </Box>
          <Box flex={1}>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Field label="Category" error={errors.category?.message} required>
                  <Select title="Event category" placeholder="Choose" value={field.value || null} options={EVENT_CATEGORIES.map((c) => ({ value: c, label: c }))} onSelect={field.onChange} error={!!errors.category} />
                </Field>
              )}
            />
          </Box>
        </Box>
        <Box flexDirection="row" style={{ gap: 16 }}>
          <Box flex={1}>
            <Controller
              control={control}
              name="startTime"
              render={({ field }) => (
                <Field label="Start" error={errors.startTime?.message} required>
                  <Select title="Start time" value={field.value ?? null} options={TIME_OPTIONS} onSelect={field.onChange} />
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
                  <Select title="End time" value={field.value ?? null} options={endTimeOptions} onSelect={field.onChange} />
                </Field>
              )}
            />
          </Box>
        </Box>

        <Controller
          control={control}
          name="headcount"
          render={({ field }) => (
            <Field label="Staff needed" error={errors.headcount?.message} required>
              <Stepper value={field.value ?? 1} onChange={field.onChange} min={1} max={100} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="budgetPerHeadKobo"
          render={({ field }) => (
            <Field label="Budget per head" error={errors.budgetPerHeadKobo?.message} required>
              <Input
                prefix="₦"
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

        <Box backgroundColor="brandEmeraldTintWeak" borderRadius="lg" borderWidth={1} borderColor="brandEmeraldTint" padding="400" marginBottom="400" style={{ gap: 4 }}>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="label" style={{ fontSize: 15 }} color="inkDefault">Estimated total</Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.3 }} color="brandEmerald">{formatNaira(total)}</Text>
          </Box>
          <Text variant="bodySm" color="inkMuted">{values.headcount} staff × {formatNaira(kobo(values.budgetPerHeadKobo || 0))}</Text>
        </Box>

        <Controller
          control={control}
          name="accommodation"
          render={({ field }) => (
            <Field label="Accommodation" helper={lateNight ? 'Required for events ending at or after 10:00 PM' : 'Optional'} error={errors.accommodation?.message} required={lateNight}>
              <Select title="Accommodation" placeholder="Select" value={field.value ?? null} options={ACCOMMODATION_STATUSES.map((s) => ({ value: s, label: s === 'PROVIDED' ? 'Provided' : 'Not provided' }))} onSelect={field.onChange} error={!!errors.accommodation} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="hairstyle"
          render={({ field }) => (
            <Field label="Hairstyle" helper="Optional" error={errors.hairstyle?.message}>
              <Select title="Hairstyle" value={field.value ?? ''} options={HAIRSTYLE_OPTIONS} onSelect={field.onChange} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="requirements"
          render={({ field }) => (
            <Field label="Extra requirements" helper="Optional" error={errors.requirements?.message}>
              <TextArea placeholder="Duties, arrival time, contact…" value={field.value ?? ''} onChangeText={field.onChange} maxLength={2000} />
            </Field>
          )}
        />

        <Box height={8} />
        <Button label="Save changes" loading={update.isPending} onPress={() => { void handleSubmit(onSubmit)(); }} />
      </Screen>
    </Box>
  );
}

export default function EditEvent(): React.JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id ?? '');

  if (event.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Edit event" showBack inset />
        <Loading />
      </Box>
    );
  }
  // A failed fetch leaves data undefined — show a retry, not the "staff already
  // confirmed" lock message below (which would falsely imply the event is closed — C4).
  if (event.isError) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Edit event" showBack inset />
        <Box style={{ paddingTop: 40 }}>
          <EmptyState
            icon="alert-circle"
            title="Couldn’t load this event"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => {
              void event.refetch();
            }}
          />
        </Box>
      </Box>
    );
  }

  const data = event.data;
  const editable =
    !!data && (data.status === 'OPEN' || data.status === 'PARTIALLY_STAFFED') && (data._count?.bookings ?? 0) === 0;

  if (!data || !editable) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Edit event" showBack inset />
        <Screen scroll>
          <Banner tone="warning" message="This event can no longer be edited — staff have already been confirmed." />
          <Box height={12} />
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </Screen>
      </Box>
    );
  }

  return <EditEventForm event={data} />;
}
