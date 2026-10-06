import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SITE_NAME } from "@/lib/site-config";

export const metadata = {
  title: "Privacy Policy",
};

const LAST_UPDATED = "October 6, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-3">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
            aria-label="Back to home"
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="text-lg font-semibold text-royal-950">
            Privacy Policy
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10 text-sm leading-relaxed text-royal-700">
        <p className="text-xs text-royal-400">Last updated: {LAST_UPDATED}</p>

        <p>
          {SITE_NAME} (&quot;Codactis&quot;, &quot;we&quot;, &quot;us&quot;) is a form-building
          tool for tournament and event registration. This page explains what
          data we collect, how it&apos;s used, and the choices you have —
          both as a form creator (&quot;admin&quot;) who signs in to build forms, and
          as a respondent who fills one out.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-royal-950">
            Information we collect
          </h2>
          <p>
            <strong className="text-royal-900">When you sign in with Google:</strong>{" "}
            we receive your name, email address, and profile picture from
            Google, used only to identify your account and show who&apos;s
            signed in. We store this alongside the forms you create.
          </p>
          <p>
            <strong className="text-royal-900">Form submissions:</strong>{" "}
            when someone fills out a form you&apos;ve built, their answers are
            stored wherever you chose at publish time — either a spreadsheet
            and file folder created in your own Google Drive, or on our
            server if you picked local storage instead. We never see or
            access responses stored in your Google Drive; that data is
            yours, in your own account.
          </p>
          <p>
            <strong className="text-royal-900">Access-code credentials:</strong>{" "}
            if you gate a form behind a username and password, the password
            is stored as a salted one-way hash — never in plain text, and
            never recoverable by us.
          </p>
          <p>
            <strong className="text-royal-900">Technical data:</strong> we
            keep a short-lived record of IP addresses and submission/login
            timestamps solely to detect and slow down spam and
            password-guessing attempts on published forms. This isn&apos;t
            used for tracking or analytics, and isn&apos;t linked to any
            personal profile.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-royal-950">
            How we use Google user data
          </h2>
          <p>
            Our use of information received from Google APIs adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-royal-600 hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p>
            We request narrow, purpose-specific Google Drive and Sheets
            access — scoped to files this app itself creates (
            <code className="rounded bg-royal-50 px-1 py-0.5 text-xs">
              drive.file
            </code>
            ), plus spreadsheet read/write for the Sheet this app creates for
            you. We cannot see, list, or modify any other file already in
            your Drive. This access is used for exactly one purpose: creating
            a spreadsheet and folder for a form you publish, and writing that
            form&apos;s responses into them as they come in. We don&apos;t
            read, share, sell, or use this data for advertising, and no
            human at Codactis views it as part of normal operation.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-royal-950">
            Your choices
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              You can revoke this app&apos;s access to your Google account at
              any time from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-royal-600 hover:underline"
              >
                Google Account permissions
              </a>{" "}
              page.
            </li>
            <li>
              Deleting a form you created removes its definition and, for
              locally-stored forms, its responses from our database. Forms
              stored in your own Google Drive are only removed by deleting
              them there, since we never hold a separate copy.
            </li>
            <li>
              You can ask us to delete your admin account and any data we
              hold using the contact option on the site.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-royal-950">
            Data sharing
          </h2>
          <p>
            We don&apos;t sell personal data, and we don&apos;t share it with
            third parties except: Google (as described above, to operate the
            Sheets/Drive storage you choose), and as required by law.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-royal-950">
            Children&apos;s privacy
          </h2>
          <p>
            This service is intended for use by event organizers (adults)
            building registration forms. It isn&apos;t directed at children
            under 13, and we don&apos;t knowingly collect personal
            information from children through the admin sign-in itself.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-royal-950">
            Changes to this policy
          </h2>
          <p>
            If this policy changes, we&apos;ll update the date at the top of
            this page.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-royal-950">Contact</h2>
          <p>
            Questions about this policy or your data — use the contact
            option available on the site, or reach out via{" "}
            <a
              href="https://www.codactics.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-royal-600 hover:underline"
            >
              codactics.com
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
