export function shouldApplyTranscript(
  acceptingResults: boolean,
  transcript: unknown,
): transcript is string {
  return acceptingResults && typeof transcript === "string" && transcript.length > 0;
}
