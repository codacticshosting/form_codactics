import Link from "next/link";

export function Footer() {
  return (
    <footer className="flex w-full flex-col items-center gap-1.5 py-6 text-center text-sm text-royal-500">
      <span>
        Developed and maintained by{" "}
        <a
          href="https://www.codactics.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-red-600 hover:underline"
        >
          CODACTICS
        </a>
      </span>
      <Link href="/privacy" className="text-xs text-royal-400 hover:underline">
        Privacy Policy
      </Link>
    </footer>
  );
}
