export function shouldLeaveOnboarding(
  fighterExists: boolean,
  profileSaveCompleted: boolean,
): boolean {
  return fighterExists || profileSaveCompleted;
}