import { expect, test, type Page, type Request } from "@playwright/test";
import { AI_CONSENT_VERSION } from "../lib/ai-consent/src/index";

const SIGN_UP = "/mobile/sign-up";
const PASSWORD = "FrameSmoke2026!";

function uniqueEmail(label: string): string {
  return `frame-mobile-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function completeSignupForm(page: Page, email: string): Promise<void> {
  await page.goto(SIGN_UP);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 characters)").fill(PASSWORD);
  await page
    .getByRole("checkbox", {
      name: "Accept the Terms of Service and Privacy Policy",
    })
    .click();
}

function isRegistration(request: Request): boolean {
  return (
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/auth/register"
  );
}

test("signup requires explicit AI acknowledgement and sends current version once", async ({
  page,
}) => {
  const email = uniqueEmail("consent");
  const registrationBodies: unknown[] = [];
  let createdToken: string | null = null;

  page.on("request", (request) => {
    if (isRegistration(request)) registrationBodies.push(request.postDataJSON());
  });
  page.on("response", async (response) => {
    if (!isRegistration(response.request()) || response.status() !== 201) return;
    const body = (await response.json()) as { token?: unknown };
    if (typeof body.token === "string") createdToken = body.token;
  });

  try {
    await completeSignupForm(page, email);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.getByText("AI Data & Privacy")).toBeVisible();

    await page.getByText("Go Back", { exact: true }).click();
    await expect(page.getByText("AI Data & Privacy")).not.toBeVisible();
    expect(registrationBodies).toHaveLength(0);

    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    const agreeButton = page.getByRole("button", { name: "Agree and continue" });
    await expect(agreeButton).toBeDisabled();
    expect(registrationBodies).toHaveLength(0);

    await page
      .getByRole("checkbox", {
        name: "I understand and agree to the AI data sharing described above",
      })
      .click();
    await expect(agreeButton).toBeEnabled();
    await agreeButton.click();

    await expect.poll(() => registrationBodies.length).toBe(1);
    expect(registrationBodies[0]).toMatchObject({
      email,
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedAiConsent: true,
      aiConsentVersion: AI_CONSENT_VERSION,
    });
    await expect(page).toHaveURL(/\/mobile\/onboarding/);
  } finally {
    if (createdToken) {
      const cleanup = await page.request.delete("/api/account", {
        headers: { Authorization: `Bearer ${createdToken}` },
      });
      expect(cleanup.ok(), "test-created signup account should be deleted").toBe(true);
    }
  }
});

test("registration failure leaves signup signed out", async ({ page }) => {
  let registrationCount = 0;
  await page.route("**/api/auth/register", async (route) => {
    registrationCount += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Intentional mobile smoke failure" }),
    });
  });

  await completeSignupForm(page, uniqueEmail("failure"));
  await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
  await page
    .getByRole("checkbox", {
      name: "I understand and agree to the AI data sharing described above",
    })
    .click();
  await page.getByRole("button", { name: "Agree and continue" }).click();

  await page.getByText("Go Back", { exact: true }).click();
  await expect(
    page.getByText("We couldn't create your account right now. Please try again."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/mobile\/sign-up/);
  expect(registrationCount).toBe(1);

  await page.goto("/mobile/");
  await expect(page).not.toHaveURL(/\/(home|onboarding)/);
});