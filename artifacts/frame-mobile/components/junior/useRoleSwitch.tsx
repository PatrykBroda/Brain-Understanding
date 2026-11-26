import React, { useCallback, useState } from "react";
import { Alert, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiPatch, apiPost, apiUrl } from "@/lib/api";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { errMsg } from "@/components/junior/ui";
import type { JuniorRole } from "@/lib/junior";

/**
 * Switch to (or add) a role. Every route goes through POST /junior/roles. If the server answers
 * AI_CONSENT_REQUIRED (account made via the parent/coach sign-up, never asked about AI), the existing
 * consent screen is shown; on accept the same request is retried.
 */
export function useRoleSwitch() {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState<{ role: JuniorRole; status: AiConsentStatus | null } | null>(null);

  const finish = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["junior"] });
    router.replace("/");
  }, [qc, router]);

  const switchTo = useCallback(
    async (role: JuniorRole) => {
      setBusy(true);
      try {
        await apiPost("/junior/roles", { role });
        await finish();
      } catch (e) {
        if (e instanceof ApiError && e.code === "AI_CONSENT_REQUIRED") {
          const status = await apiGet<AiConsentStatus>("/ai-consent").catch(() => null);
          setConsent({ role, status });
        } else {
          Alert.alert("Could not switch", errMsg(e));
        }
      } finally {
        setBusy(false);
      }
    },
    [finish],
  );

  const accept = useCallback(async () => {
    if (!consent) return;
    setBusy(true);
    try {
      const status = await apiPatch<AiConsentStatus>("/ai-consent", { accepted: true });
      qc.setQueryData(["ai-consent"], status);
      const role = consent.role;
      setConsent(null);
      await apiPost("/junior/roles", { role });
      await finish();
    } catch (e) {
      Alert.alert("Could not switch", errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [consent, qc, finish]);

  const consentModal = consent ? (
    <AiConsentModal
      visible
      status={consent.status}
      busy={busy}
      onAccept={() => void accept()}
      onDecline={() => setConsent(null)}
      onPrivacy={() => void Linking.openURL(apiUrl("/privacy"))}
      onTerms={() => void Linking.openURL(apiUrl("/terms"))}
    />
  ) : null;

  return { switchTo, busy, consentModal };
}
