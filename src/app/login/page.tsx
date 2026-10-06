import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { signIn } from "@/auth";

// Keyed by the `error` codes NextAuth appends to the signIn page's URL
// (configured via `pages.signIn` in auth.ts) — e.g. a Google account that
// isn't an approved test user yet while the OAuth app is in Testing mode.
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Google blocked that sign-in. If this app is still in testing, ask the owner to add your email as a test user.",
  OAuthAccountNotLinked:
    "That email is already linked to a different sign-in method. Try the Google account you used originally.",
  default: "Something went wrong signing you in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  // Only accept relative, in-app paths — never redirect somewhere else
  // just because a query string asked for it.
  const redirectTo =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.default) : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Link
        href="/"
        className="flex items-center gap-1 text-xs font-medium text-royal-400 transition-colors hover:text-royal-600"
      >
        <ArrowLeft size={12} />
        Back to home
      </Link>

      <Image
        src="/logo/codactics.png"
        alt="Codactis logo"
        width={72}
        height={72}
        priority
        className="rounded-2xl"
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-royal-950">
          Sign in to Codactis
        </h1>
        <p className="max-w-sm text-sm text-royal-600">
          Use your Google account to build and manage your forms.
        </p>
      </div>

      {errorMessage && (
        <p className="max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-red-700">
          {errorMessage}
        </p>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button
          type="submit"
          className="flex h-12 items-center gap-3 rounded-full border border-royal-200 bg-white px-6 text-sm font-medium text-royal-900 shadow-sm transition-colors hover:bg-royal-50 hover:shadow-md"
        >
          <GoogleIcon />
          Sign in with Google
        </button>
      </form>

      <div className="flex max-w-sm flex-col gap-2 pt-2 text-xs text-royal-500">
        <div className="flex items-start gap-2">
          <FileSpreadsheet size={14} className="mt-0.5 shrink-0 text-royal-400" />
          <span>
            You choose per form where responses go: a spreadsheet in your
            own Google Drive, or kept locally on our server — never both,
            always your call.
          </span>
        </div>
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-royal-400" />
          <span>Google sign-in is only used to save your forms and, if you pick Drive, write responses there.</span>
        </div>
      </div>
    </div>
  );
}

// Google's own multi-color logomark — recognizable at a glance, and the
// white-background/colored-icon style matches what people are used to
// seeing on "Sign in with Google" buttons elsewhere on the web.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
