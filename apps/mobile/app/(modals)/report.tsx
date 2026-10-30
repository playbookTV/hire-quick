import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { REPORT_REASONS, marketplaceReportSchema } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Field } from '../../components/Field.js';
import { Select } from '../../components/Select.js';
import { TextArea } from '../../components/TextArea.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { api } from '../../lib/client.js';
import { userMessage } from '../../lib/api-error.js';

export default function Report(): React.JSX.Element {
  const { targetId, targetType } = useLocalSearchParams<{ targetId: string; targetType: string }>();
  const router = useRouter();
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const parsed = marketplaceReportSchema.safeParse({ targetId, targetType, reason, details });
  const submit = useMutation({
    mutationFn: () =>
      api.post<{ id: string; status: string }>(
        '/api/reports',
        marketplaceReportSchema.parse({ targetId, targetType, reason, details }),
      ),
  });
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title={targetType === 'WORKER' ? 'Report worker' : 'Report job'} showBack inset />
      <Screen scroll>
        <Box gap="400">
          {submit.isSuccess ? (
            <>
              <Text variant="h2">Report received</Text>
              <Text variant="body">
                Our team will review your report. You do not need to book to raise a concern.
              </Text>
              <Text variant="bodySm" color="inkMuted">
                Reference: {submit.data.id}
              </Text>
              <Button label="Done" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Text variant="body">
                Tell our team what happened. Include relevant details, but leave out private
                identity or payment information.
              </Text>
              <Field label="Reason" required>
                <Select
                  value={reason || null}
                  options={REPORT_REASONS.map((v) => ({ value: v, label: v }))}
                  onSelect={setReason}
                />
              </Field>
              <Field label="Details" helper="At least 10 characters" required>
                <TextArea value={details} onChangeText={setDetails} maxLength={2000} />
              </Field>
              {submit.isError ? (
                <Banner tone="warning" message={userMessage(submit.error)} />
              ) : null}
              <Button
                label="Send report"
                loading={submit.isPending}
                disabled={!parsed.success}
                onPress={() => submit.mutate()}
              />
            </>
          )}
        </Box>
      </Screen>
    </Box>
  );
}
