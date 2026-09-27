import { reportSmile } from '../lib/monitoring.js';
import { Text } from 'react-native';
import { CaptureType, JobType, UseSmileIDBuilder } from '@smileid/usesmileid';
import { faceAnalyzer } from '../lib/smile-providers.js';
import { startKyc, type SmileCaptureProps } from '../lib/kyc.js';
import { smileSubmissionDetails, smileSubmissionInterceptor } from '../lib/smile-submission-monitoring.js';

/** Full-screen SDK owns safe areas and camera UI. Never treat submission as approval. */
export default function SmileCapture({
  session,
  identity,
  onSubmitted,
  onCancelled,
  onFailure,
}: SmileCaptureProps) {
  return (
    <UseSmileIDBuilder
      builder={(b) => {
        // HireQuick owns the process-wide Sentry integration and privacy filter.
        b.config((c) => {
          c.enableCrashReporting = false;
        });
        b.network((n) => {
          n.config((c) => {
            c.jobType = JobType.biometricKyc;
            c.token = session.token;
            c.onTokenExpired = async () => {
              try { return (await startKyc(identity, session.referenceId)).token; }
              catch (error) {
                reportSmile('SMILE_TOKEN_REFRESH_FAILED', session.referenceId);
                throw error;
              }
            };
            c.partnerConfig((p) => {
              p.partnerId = session.partnerId;
              p.useSandbox = session.sandbox;
              // The backend binds the callback URL into the token. Do not override it.
            });
          });
          n.interceptors((i) => i.add(smileSubmissionInterceptor((details) =>
            reportSmile('SMILE_CAPTURE_FAILED', session.referenceId, details),
          )));
        });
        b.biometricKYCParams = {
          country: 'NG',
          idType: identity.idType === 'NIN' ? 'NIN_V2' : 'BVN',
          idNumber: identity.idNumber,
          useEnrolledImage: false,
        };
        // Name/contact fields are securely bound by the backend token.
        b.ml((m) =>
          m.analyzers((a) =>
            a.forCaptureType(CaptureType.selfie, (face) => face.add(faceAnalyzer)),
          ),
        );
        b.screens((screens) => {
          screens.consent((c) => {
            c.partnerName = 'HireQuick';
            c.partnerPrivacyPolicyUrl = session.privacyPolicyUrl;
            c.partnerIcon = <Text style={{ fontWeight: '700', fontSize: 24 }}>HQ</Text>;
          });
          screens.instructions();
          screens.capture((c) => {
            c.captureType = CaptureType.selfie;
            c.selfie((s) => {
              s.enableEnhancedLiveness = true;
            });
          });
          screens.preview();
          screens.processing();
        });
        b.onResult = (result) => {
          if (result.status === 'success') onSubmitted();
          else if (result.status === 'cancelled') onCancelled();
          else {
            reportSmile('SMILE_CAPTURE_FAILED', session.referenceId, smileSubmissionDetails(result.error));
            onFailure();
          }
        };
      }}
    />
  );
}
